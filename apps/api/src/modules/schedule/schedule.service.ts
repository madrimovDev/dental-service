import type { Context } from 'hono';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { computeAvailability, WEEKDAY_KEYS, weekdayOf } from './schedule.availability.ts';
import {
  toAvailabilitySlotDto,
  toTimeOffDto,
  toWorkingHoursSegmentDto,
} from './schedule.mapper.ts';
import { createScheduleRepository } from './schedule.repository.ts';
import type {
  AvailabilityQuery,
  BranchAvailabilityQuery,
  CreateTimeOffInput,
  ListTimeOffQuery,
  PutWorkingHoursInput,
} from './schedule.schema.ts';

export const createScheduleService = (deps: { audit: AuditLogger }) => {
  const repo = createScheduleRepository();

  // ─── Working hours ──────────────────────────────────────────────────────

  async function getWorkingHours(c: Context, doctorId: string, branchId?: string) {
    const rows = await repo.listSegments(c, doctorId, branchId);
    return rows.map(toWorkingHoursSegmentDto);
  }

  async function replaceWorkingHours(c: Context, doctorId: string, input: PutWorkingHoursInput) {
    const tenantId = c.get('activeTenantId');
    if (!tenantId) return { ok: false as const, code: 'tenant.missing' };

    // Validatsiya: har segment start < end.
    for (const s of input.segments) {
      const start = hhmm(s.start);
      const end = hhmm(s.end);
      if (end <= start) return { ok: false as const, code: 'time.invalid' };
    }

    const before = await repo.listSegments(c, doctorId, input.branchId);
    const rows = await repo.replaceSegments(
      c,
      doctorId,
      input.branchId,
      input.segments.map((s) => ({
        tenantId,
        branchId: input.branchId,
        doctorId,
        weekday: s.weekday,
        startMinute: hhmm(s.start),
        endMinute: hhmm(s.end),
        effectiveFrom: s.effectiveFrom ?? null,
        effectiveUntil: s.effectiveUntil ?? null,
      })),
    );

    await deps.audit.record(c, {
      action: 'updated',
      resourceType: 'doctor_schedule',
      resourceId: doctorId,
      before,
      after: rows,
    });

    return { ok: true as const, segments: rows.map(toWorkingHoursSegmentDto) };
  }

  // ─── Time off ─────────────────────────────────────────────────────────────

  async function listTimeOff(c: Context, query: ListTimeOffQuery) {
    const rows = await repo.listTimeOff(c, {
      doctorId: query.doctorId,
      branchId: query.branchId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    return rows.map(toTimeOffDto);
  }

  async function createTimeOff(c: Context, input: CreateTimeOffInput) {
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) return { ok: false as const, code: 'tenant.missing' };

    const start = new Date(input.startAt);
    const end = new Date(input.endAt);
    if (end <= start) return { ok: false as const, code: 'time.invalid' };

    const row = await repo.createTimeOff(c, {
      tenantId,
      doctorId: input.doctorId,
      branchId: input.branchId ?? null,
      type: input.type,
      startAt: start,
      endAt: end,
      reason: input.reason ?? null,
      createdBy: user?.id ?? null,
    });
    if (!row) return { ok: false as const, code: 'insert.failed' };

    await deps.audit.record(c, {
      action: 'created',
      resourceType: 'doctor_time_off',
      resourceId: row.id,
      after: row,
    });

    return { ok: true as const, timeOff: toTimeOffDto(row) };
  }

  async function deleteTimeOff(c: Context, id: string) {
    const before = await repo.getTimeOffById(c, id);
    if (!before) return { ok: false as const, code: 'not_found' };
    const row = await repo.deleteTimeOff(c, id);
    if (!row) return { ok: false as const, code: 'not_found' };

    await deps.audit.record(c, {
      action: 'deleted',
      resourceType: 'doctor_time_off',
      resourceId: id,
      before,
    });

    return { ok: true as const };
  }

  // ─── Availability ───────────────────────────────────────────────────────

  async function getAvailability(c: Context, query: AvailabilityQuery) {
    // Kun [start,end) instant chegaralari — UTC+5 local 00:00 → +1 kun 00:00.
    // Bir kun avval/keyingacha kengaytirib o'qiymiz (chegaradagi event'lar uchun
    // clip pure funksiyada to'g'ri amalga oshiriladi).
    const dayStart = new Date(`${query.date}T00:00:00+05:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);

    const [workHours, appts, timeOffs] = await Promise.all([
      repo.getBranchWorkHours(c, query.branchId),
      repo.listDoctorAppointments(c, query.doctorId, dayStart, dayEnd),
      repo.listOverlappingTimeOff(c, query.doctorId, query.branchId, dayStart, dayEnd),
    ]);

    // Weekday'dagi segmentlar (effective oynasi pure funksiyada filtrlanadi).
    const weekday = weekdayOf(query.date);
    const segRows = await repo.listActiveSegmentsForDay(c, query.doctorId, query.branchId, weekday);

    const slots = computeAvailability({
      date: query.date,
      doctorSegments: segRows.map((s) => ({
        weekday: s.weekday,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        effectiveFrom: s.effectiveFrom,
        effectiveUntil: s.effectiveUntil,
      })),
      branchWorkHours: workHours,
      appointments: appts,
      timeOffs,
      slotMinutes: query.slotMinutes,
    });

    return {
      doctorId: query.doctorId,
      branchId: query.branchId,
      date: query.date,
      slotMinutes: query.slotMinutes,
      slots: slots.map(toAvailabilitySlotDto),
    };
  }

  /**
   * Branch-wide availability (DS4 — right-rail "Bo'sh slot"): doktor tanlamasdan,
   * filialdagi shu hafta-kunida aktiv ish-soati bor BARCHA doktorlarning bo'sh
   * slotlari. Single-doctor `getAvailability` bilan bir xil pure yadro
   * (`computeAvailability`) — har doktor uchun qayta ishlatiladi. Migration yo'q.
   */
  async function getBranchAvailability(c: Context, query: BranchAvailabilityQuery) {
    const dayStart = new Date(`${query.date}T00:00:00+05:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
    const weekday = weekdayOf(query.date);

    // Filial uchun barcha kirishlarni bir necha so'rovda (per-doktor N+1 emas).
    const [workHours, segRows, apptRows, timeOffRows] = await Promise.all([
      repo.getBranchWorkHours(c, query.branchId),
      repo.listBranchActiveSegmentsForDay(c, query.branchId, weekday),
      repo.listBranchAppointments(c, query.branchId, dayStart, dayEnd),
      repo.listBranchOverlappingTimeOff(c, query.branchId, dayStart, dayEnd),
    ]);

    // doctorId bo'yicha guruhlash.
    const segsByDoctor = new Map<string, typeof segRows>();
    for (const s of segRows) {
      const arr = segsByDoctor.get(s.doctorId);
      if (arr) arr.push(s);
      else segsByDoctor.set(s.doctorId, [s]);
    }
    const apptsByDoctor = new Map<string, typeof apptRows>();
    for (const a of apptRows) {
      const arr = apptsByDoctor.get(a.doctorId);
      if (arr) arr.push(a);
      else apptsByDoctor.set(a.doctorId, [a]);
    }
    const timeOffByDoctor = new Map<string, typeof timeOffRows>();
    for (const t of timeOffRows) {
      const arr = timeOffByDoctor.get(t.doctorId);
      if (arr) arr.push(t);
      else timeOffByDoctor.set(t.doctorId, [t]);
    }

    // Faqat shu kunda aktiv segmentга ega doktorlar (deterministik tartib).
    const doctorIds = [...segsByDoctor.keys()].sort();
    const doctors = doctorIds.map((doctorId) => {
      const slots = computeAvailability({
        date: query.date,
        doctorSegments: (segsByDoctor.get(doctorId) ?? []).map((s) => ({
          weekday: s.weekday,
          startMinute: s.startMinute,
          endMinute: s.endMinute,
          effectiveFrom: s.effectiveFrom,
          effectiveUntil: s.effectiveUntil,
        })),
        branchWorkHours: workHours,
        appointments: apptsByDoctor.get(doctorId) ?? [],
        timeOffs: timeOffByDoctor.get(doctorId) ?? [],
        slotMinutes: query.slotMinutes,
      });
      return { doctorId, slots: slots.map(toAvailabilitySlotDto) };
    });

    return {
      branchId: query.branchId,
      date: query.date,
      slotMinutes: query.slotMinutes,
      doctors,
    };
  }

  // ─── Predicates (A6 — appointments integration imports these) ─────────────

  /**
   * `[start,end)` butunlay doktorning shu filialdagi aktiv ish-soatlari ichida
   * bo'lsa true. Bir nechta kunga cho'zilsa false (bitta kun ichida kutiladi).
   * Doktor uchun ushbu weekday'da segment yo'q bo'lsa false.
   */
  async function isWithinWorkingHours(
    c: Context,
    doctorId: string,
    branchId: string,
    start: Date,
    end: Date,
  ): Promise<boolean> {
    // Local kalendar kuni va daqiqalar (Asia/Tashkent UTC+5).
    const dateStr = localDateStr(start);
    const startMin = localMinute(start, dateStr);
    const endMin = localMinute(end, dateStr);
    // Boshqa kunga o'tib ketsa (yoki manfiy) — qamrov tashqarisi.
    if (endMin <= startMin || startMin < 0 || endMin > 1440) return false;

    const weekday = weekdayOf(dateStr);
    const [segs, workHours] = await Promise.all([
      repo.listActiveSegmentsForDay(c, doctorId, branchId, weekday),
      repo.getBranchWorkHours(c, branchId),
    ]);
    if (segs.length === 0) return false;

    // A3 bilan izchillik: ish-soati = intersect(branchOpen[weekday], doctor
    // segmentlari). Filial yopiq/sozlanmagan bo'lsa — qamrov tashqarisi.
    const branchEntry = workHours ? workHours[WEEKDAY_KEYS[weekday] ?? ''] : undefined;
    if (!branchEntry) return false;
    const branchStart = hhmm(branchEntry.open);
    const branchEnd = hhmm(branchEntry.close);
    if (startMin < branchStart || endMin > branchEnd) return false;

    // effective oynasi + butun [startMin,endMin) bitta segmentга sig'sa.
    return segs.some(
      (s) =>
        inWindow(s.effectiveFrom, s.effectiveUntil, dateStr) &&
        s.startMinute <= startMin &&
        s.endMinute >= endMin,
    );
  }

  /** `[start,end)` doktorning time-off'i bilan kesishsa true. */
  async function isOnTimeOff(
    c: Context,
    doctorId: string,
    branchId: string,
    start: Date,
    end: Date,
  ): Promise<boolean> {
    return repo.hasOverlappingTimeOff(c, doctorId, branchId, start, end);
  }

  return {
    getWorkingHours,
    replaceWorkingHours,
    listTimeOff,
    createTimeOff,
    deleteTimeOff,
    getAvailability,
    getBranchAvailability,
    isWithinWorkingHours,
    isOnTimeOff,
  };
};

export type ScheduleService = ReturnType<typeof createScheduleService>;

// ─── local helpers (Asia/Tashkent UTC+5) ────────────────────────────────────

const hhmm = (s: string): number => {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Instant → klinika-local 'YYYY-MM-DD' (UTC+5). */
function localDateStr(d: Date): string {
  const local = new Date(d.getTime() + 5 * 60 * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Instant → shu kun (dateStr, +05:00 anchor) bo'yicha local daqiqa. */
function localMinute(d: Date, dateStr: string): number {
  const dayStart = new Date(`${dateStr}T00:00:00+05:00`);
  return Math.round((d.getTime() - dayStart.getTime()) / 60_000);
}

function inWindow(from: string | null, until: string | null, dateStr: string): boolean {
  if (from && dateStr < from) return false;
  if (until && dateStr > until) return false;
  return true;
}
