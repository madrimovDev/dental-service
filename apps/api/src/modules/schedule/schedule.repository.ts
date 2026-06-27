import {
  appointments,
  branches,
  type DoctorScheduleInsert,
  type DoctorTimeOffInsert,
  doctorSchedules,
  doctorTimeOff,
} from '@dental/db-schema';
import { and, asc, eq, gt, gte, isNull, lt, ne, or } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';

/**
 * Schedule data access — Drizzle, getDb(c) (RLS-bound). Biznes mantiqsiz.
 * Query'larda explicit `WHERE tenant_id` YO'Q — RLS filtrlaydi.
 */
export const createScheduleRepository = () => {
  // ─── doctor_schedules ─────────────────────────────────────────────────────

  async function listSegments(c: Context, doctorId: string, branchId?: string) {
    const db = getDb(c);
    const filters = [eq(doctorSchedules.doctorId, doctorId)];
    if (branchId) filters.push(eq(doctorSchedules.branchId, branchId));
    return db
      .select()
      .from(doctorSchedules)
      .where(and(...filters))
      .orderBy(asc(doctorSchedules.weekday), asc(doctorSchedules.startMinute));
  }

  /** Doktor+filial uchun barcha segmentlarni almashtirish (bulk replace). */
  async function replaceSegments(
    c: Context,
    doctorId: string,
    branchId: string,
    rows: DoctorScheduleInsert[],
  ) {
    const db = getDb(c);
    await db
      .delete(doctorSchedules)
      .where(and(eq(doctorSchedules.doctorId, doctorId), eq(doctorSchedules.branchId, branchId)));
    if (rows.length === 0) return [];
    return db.insert(doctorSchedules).values(rows).returning();
  }

  // ─── doctor_time_off ──────────────────────────────────────────────────────

  async function listTimeOff(
    c: Context,
    query: { doctorId?: string; branchId?: string; from?: Date; to?: Date },
  ) {
    const db = getDb(c);
    const filters = [];
    if (query.doctorId) filters.push(eq(doctorTimeOff.doctorId, query.doctorId));
    if (query.branchId) filters.push(eq(doctorTimeOff.branchId, query.branchId));
    // Range overlap [from,to): startAt < to AND endAt > from.
    if (query.to) filters.push(lt(doctorTimeOff.startAt, query.to));
    if (query.from) filters.push(gte(doctorTimeOff.endAt, query.from));
    return db
      .select()
      .from(doctorTimeOff)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(asc(doctorTimeOff.startAt));
  }

  async function getTimeOffById(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.select().from(doctorTimeOff).where(eq(doctorTimeOff.id, id));
    return row ?? null;
  }

  async function createTimeOff(c: Context, values: DoctorTimeOffInsert) {
    const db = getDb(c);
    const [row] = await db.insert(doctorTimeOff).values(values).returning();
    return row ?? null;
  }

  async function deleteTimeOff(c: Context, id: string) {
    const db = getDb(c);
    const [row] = await db.delete(doctorTimeOff).where(eq(doctorTimeOff.id, id)).returning();
    return row ?? null;
  }

  // ─── availability inputs ──────────────────────────────────────────────────

  /** Branch work_hours JSONB (RLS-scoped). */
  async function getBranchWorkHours(c: Context, branchId: string) {
    const db = getDb(c);
    const [row] = await db
      .select({ workHours: branches.workHours })
      .from(branches)
      .where(eq(branches.id, branchId));
    return row?.workHours ?? null;
  }

  /**
   * Berilgan [start,end) instant oraliqdagi doktor appointmentlari (cancelled
   * tashqari) — availability busy hisobi uchun.
   */
  async function listDoctorAppointments(c: Context, doctorId: string, start: Date, end: Date) {
    const db = getDb(c);
    return db
      .select({ startAt: appointments.startTime, endAt: appointments.endTime })
      .from(appointments)
      .where(
        and(
          eq(appointments.doctorId, doctorId),
          ne(appointments.status, 'cancelled' as const),
          lt(appointments.startTime, end),
          // existing.endTime > start
          gte(appointments.endTime, start),
        ),
      );
  }

  /**
   * Berilgan [start,end) instant oraliq bilan kesishgan time-off'lar.
   * branchId null (barcha filial) YOKI berilgan filialga teng.
   */
  async function listOverlappingTimeOff(
    c: Context,
    doctorId: string,
    branchId: string,
    start: Date,
    end: Date,
  ) {
    const db = getDb(c);
    return db
      .select({ startAt: doctorTimeOff.startAt, endAt: doctorTimeOff.endAt })
      .from(doctorTimeOff)
      .where(
        and(
          eq(doctorTimeOff.doctorId, doctorId),
          or(isNull(doctorTimeOff.branchId), eq(doctorTimeOff.branchId, branchId)),
          lt(doctorTimeOff.startAt, end),
          gte(doctorTimeOff.endAt, start),
        ),
      );
  }

  /** Doktor+filial+weekday uchun aktiv segmentlar (working-hours guard uchun). */
  async function listActiveSegmentsForDay(
    c: Context,
    doctorId: string,
    branchId: string,
    weekday: number,
  ) {
    const db = getDb(c);
    return db
      .select()
      .from(doctorSchedules)
      .where(
        and(
          eq(doctorSchedules.doctorId, doctorId),
          eq(doctorSchedules.branchId, branchId),
          eq(doctorSchedules.weekday, weekday),
          eq(doctorSchedules.isActive, true),
        ),
      );
  }

  // ─── branch-wide availability inputs (DS4) ────────────────────────────────
  // Filialdagi BARCHA doktorlar uchun bir kunlik availability bir necha
  // so'rovda (per-doktor N+1 emas) — service xotirada doctorId bo'yicha guruh-
  // laydi va har biri uchun `computeAvailability` chaqiradi.

  /** Filial+weekday uchun barcha doktorlarning aktiv segmentlari. */
  async function listBranchActiveSegmentsForDay(c: Context, branchId: string, weekday: number) {
    const db = getDb(c);
    return db
      .select()
      .from(doctorSchedules)
      .where(
        and(
          eq(doctorSchedules.branchId, branchId),
          eq(doctorSchedules.weekday, weekday),
          eq(doctorSchedules.isActive, true),
        ),
      );
  }

  /** Filialdagi [start,end) oraliq appointmentlari (cancelled tashqari), doctorId bilan. */
  async function listBranchAppointments(c: Context, branchId: string, start: Date, end: Date) {
    const db = getDb(c);
    return db
      .select({
        doctorId: appointments.doctorId,
        startAt: appointments.startTime,
        endAt: appointments.endTime,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.branchId, branchId),
          ne(appointments.status, 'cancelled' as const),
          lt(appointments.startTime, end),
          gte(appointments.endTime, start),
        ),
      );
  }

  /**
   * Filialdagi [start,end) bilan kesishgan time-off'lar, doctorId bilan.
   * branchId null (barcha filial) YOKI berilgan filialga teng.
   */
  async function listBranchOverlappingTimeOff(
    c: Context,
    branchId: string,
    start: Date,
    end: Date,
  ) {
    const db = getDb(c);
    return db
      .select({
        doctorId: doctorTimeOff.doctorId,
        startAt: doctorTimeOff.startAt,
        endAt: doctorTimeOff.endAt,
      })
      .from(doctorTimeOff)
      .where(
        and(
          or(isNull(doctorTimeOff.branchId), eq(doctorTimeOff.branchId, branchId)),
          lt(doctorTimeOff.startAt, end),
          gte(doctorTimeOff.endAt, start),
        ),
      );
  }

  /** Instant [start,end) bilan kesishgan time-off bormi (guard uchun). */
  async function hasOverlappingTimeOff(
    c: Context,
    doctorId: string,
    branchId: string,
    start: Date,
    end: Date,
  ): Promise<boolean> {
    const db = getDb(c);
    const [row] = await db
      .select({ id: doctorTimeOff.id })
      .from(doctorTimeOff)
      .where(
        and(
          eq(doctorTimeOff.doctorId, doctorId),
          or(isNull(doctorTimeOff.branchId), eq(doctorTimeOff.branchId, branchId)),
          // Yarim-ochiq [start,end) overlap: existing.start < new.end AND
          // existing.end > new.start (checkConflict `gt` bilan izchil — yelkama-
          // yelka time-off konflikt EMAS).
          lt(doctorTimeOff.startAt, end),
          gt(doctorTimeOff.endAt, start),
        ),
      )
      .limit(1);
    return !!row;
  }

  return {
    listSegments,
    replaceSegments,
    listTimeOff,
    getTimeOffById,
    createTimeOff,
    deleteTimeOff,
    getBranchWorkHours,
    listDoctorAppointments,
    listOverlappingTimeOff,
    listActiveSegmentsForDay,
    listBranchActiveSegmentsForDay,
    listBranchAppointments,
    listBranchOverlappingTimeOff,
    hasOverlappingTimeOff,
  };
};

export type ScheduleRepository = ReturnType<typeof createScheduleRepository>;
