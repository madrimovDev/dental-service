import { appointments, patientNoShowStrikes } from '@dental/db-schema';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';

/**
 * CLI-474 (L7) — no-show strike data access. RLS-bound (`getDb`). "Faol" strike'lar
 * har doim `appointments.status = 'no_show'` bilan JOIN qilib hisoblanadi (join-
 * anchored) — misclick tuzatilsa (no_show → completed) strike avtomatik faol
 * count'dan tushadi, un-transition hook shart emas (row tarix sifatida qoladi).
 */
export const createNoShowStrikesRepository = () => {
  /** no_show transition'da strike yaratadi. Unique(appointment_id) → idempotent. */
  const recordIfAbsent = async (
    c: Context,
    args: { tenantId: string; patientId: string; appointmentId: string },
  ): Promise<void> => {
    const db = getDb(c);
    await db
      .insert(patientNoShowStrikes)
      .values({
        tenantId: args.tenantId,
        patientId: args.patientId,
        appointmentId: args.appointmentId,
      })
      .onConflictDoNothing({ target: patientNoShowStrikes.appointmentId });
  };

  /** Bitta bemorning faol (waivedmas + hali no_show) strike soni. */
  const activeCountByPatient = async (c: Context, patientId: string): Promise<number> => {
    const db = getDb(c);
    const [row] = await db
      .select({ c: count() })
      .from(patientNoShowStrikes)
      .innerJoin(appointments, eq(appointments.id, patientNoShowStrikes.appointmentId))
      .where(
        and(
          eq(patientNoShowStrikes.patientId, patientId),
          eq(patientNoShowStrikes.waived, false),
          eq(appointments.status, 'no_show'),
        ),
      );
    return Number(row?.c ?? 0);
  };

  /** Ko'p bemor uchun faol strike soni (bemor ro'yxati DTO'si — per-row so'rovsiz). */
  const activeCountForPatients = async (
    c: Context,
    patientIds: string[],
  ): Promise<Map<string, number>> => {
    const result = new Map<string, number>();
    if (patientIds.length === 0) return result;
    const db = getDb(c);
    const rows = await db
      .select({ patientId: patientNoShowStrikes.patientId, c: count() })
      .from(patientNoShowStrikes)
      .innerJoin(appointments, eq(appointments.id, patientNoShowStrikes.appointmentId))
      .where(
        and(
          inArray(patientNoShowStrikes.patientId, patientIds),
          eq(patientNoShowStrikes.waived, false),
          eq(appointments.status, 'no_show'),
        ),
      )
      .groupBy(patientNoShowStrikes.patientId);
    for (const r of rows) result.set(r.patientId, Number(r.c));
    return result;
  };

  /** Bemorning strike tarixi (waived holatlari bilan, yangi birinchi). */
  const listByPatient = async (c: Context, patientId: string) => {
    const db = getDb(c);
    return db
      .select({
        id: patientNoShowStrikes.id,
        appointmentId: patientNoShowStrikes.appointmentId,
        waived: patientNoShowStrikes.waived,
        waivedReason: patientNoShowStrikes.waivedReason,
        waivedAt: patientNoShowStrikes.waivedAt,
        createdAt: patientNoShowStrikes.createdAt,
        appointmentStatus: appointments.status,
        startTime: appointments.startTime,
      })
      .from(patientNoShowStrikes)
      .innerJoin(appointments, eq(appointments.id, patientNoShowStrikes.appointmentId))
      .where(eq(patientNoShowStrikes.patientId, patientId))
      .orderBy(desc(patientNoShowStrikes.createdAt));
  };

  const getById = async (c: Context, id: string) => {
    const db = getDb(c);
    const [row] = await db
      .select()
      .from(patientNoShowStrikes)
      .where(eq(patientNoShowStrikes.id, id))
      .limit(1);
    return row ?? null;
  };

  /** Strike'ni kechirish (waive) — faol count'dan chiqaradi, row saqlanadi. */
  const waive = async (
    c: Context,
    id: string,
    args: { reason: string | null; userId: string | null },
  ) => {
    const db = getDb(c);
    const [row] = await db
      .update(patientNoShowStrikes)
      .set({
        waived: true,
        waivedReason: args.reason,
        waivedBy: args.userId,
        waivedAt: new Date(),
      })
      .where(eq(patientNoShowStrikes.id, id))
      .returning();
    return row ?? null;
  };

  return {
    recordIfAbsent,
    activeCountByPatient,
    activeCountForPatients,
    listByPatient,
    getById,
    waive,
  };
};

export type NoShowStrikesRepository = ReturnType<typeof createNoShowStrikesRepository>;
