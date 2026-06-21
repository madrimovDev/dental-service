/**
 * Schedule availability — sof agregatsiya (SQL'siz, testlanadigan yadro).
 *
 * `computeAvailability` doktorning berilgan kundagi bo'sh slot'larini hisoblaydi:
 *   base = intersect(branch ish-soati[weekday], doktor segmentlari[weekday])
 *   busy = appointmentlar(kun) ∪ time-off'lar(kun bilan kesishgan)
 *   free = subtract(base, busy)
 *   slots = tile(free, slotMinutes)  — yarim-ochiq [start, end)
 *
 * Yarim-ochiq [start, end) konvensiyasi hamma joyda (M9.4 checkConflict `gt`
 * bilan izchil): yelkama-yelka slot'lar bir-biriga tegmaydi.
 *
 * Vaqt zonasi: Asia/Tashkent = UTC+5 (DST yo'q — Qaror #22). Fixed offset
 * bo'lgani uchun Intl'siz to'g'ridan-to'g'ri arifmetika ishlatamiz.
 */

export type Interval = { start: number; end: number }; // daqiqa, yarim tundan (local)

export type DoctorSegment = {
  weekday: number; // 0=Sun .. 6=Sat
  startMinute: number;
  endMinute: number;
  effectiveFrom?: string | null; // 'YYYY-MM-DD'
  effectiveUntil?: string | null;
};

/** branch work_hours JSONB: kalit 'sun'..'sat', {open,close} "HH:mm" yoki null=yopiq. */
export type BranchWorkHours = Record<string, { open: string; close: string } | null> | null;

export type BusyAppointment = { startAt: Date; endAt: Date };
export type BusyTimeOff = { startAt: Date; endAt: Date };

export type AvailabilitySlot = {
  /** local daqiqa (yarim tundan) — debugging/testing uchun. */
  startMinute: number;
  endMinute: number;
  /** UTC instant ISO — wire qiymati. */
  start: string;
  end: string;
};

/** weekday key tartibi — JS getUTCDay() (0=Sun) va reports konvensiyasiga mos. */
export const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** "HH:mm" → daqiqa (yarim tundan). */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * 'YYYY-MM-DD' uchun klinika-local hafta kuni (0=Sun..6=Sat).
 *
 * ⚠️ TUZOQ: weekday'ni UTC-anchor'da hisoblaymiz (`T00:00:00Z`), slot instant
 * anchor'da (`+05:00`) EMAS. Sabab: local yarim tun = oldingi kun 19:00 UTC,
 * shuning uchun `+05:00` instant'da `getUTCDay()` chaqirilsa weekday off-by-one
 * bo'ladi. Kalendar-kun nomi date string'ning o'zidan kelib chiqadi.
 */
export function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/**
 * 'YYYY-MM-DD' + local-daqiqa → UTC instant.
 * dayStart (local 00:00) = `${dateStr}T00:00:00+05:00`. Slot instant =
 * dayStart + minute. Misol: "2026-06-22" + 540 → 2026-06-22T04:00:00.000Z
 * = 09:00 Tashkent. ✓
 */
function localMinuteToInstant(dateStr: string, minute: number): Date {
  const dayStart = new Date(`${dateStr}T00:00:00+05:00`);
  return new Date(dayStart.getTime() + minute * 60_000);
}

/** UTC instant → shu kundagi local daqiqa (yarim tundan), [0,1440)'ga clip emas. */
function instantToLocalMinute(instant: Date, dateStr: string): number {
  const dayStart = new Date(`${dateStr}T00:00:00+05:00`);
  return Math.round((instant.getTime() - dayStart.getTime()) / 60_000);
}

/** effectiveFrom/Until oynasiga date kirsa true (inclusive). */
function inEffectiveWindow(seg: DoctorSegment, dateStr: string): boolean {
  if (seg.effectiveFrom && dateStr < seg.effectiveFrom) return false;
  if (seg.effectiveUntil && dateStr > seg.effectiveUntil) return false;
  return true;
}

/** Ikki interval kesishmasi (yarim-ochiq). Bo'sh bo'lsa null. */
function intersectOne(a: Interval, b: Interval): Interval | null {
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}

/** Interval ro'yxatdan busy intervallarni ayiradi (yarim-ochiq). */
function subtract(base: Interval[], busy: Interval[]): Interval[] {
  let result = base.filter((i) => i.end > i.start);
  for (const b of busy) {
    const next: Interval[] = [];
    for (const seg of result) {
      // Kesishmasa — o'zgarishsiz.
      if (b.end <= seg.start || b.start >= seg.end) {
        next.push(seg);
        continue;
      }
      // Chap qoldiq.
      if (b.start > seg.start) next.push({ start: seg.start, end: b.start });
      // O'ng qoldiq.
      if (b.end < seg.end) next.push({ start: b.end, end: seg.end });
    }
    result = next;
  }
  return result;
}

/** Bo'sh intervalni slotMinutes bo'yicha to'liq slot'larga bo'ladi (qisman quyruq tashlanadi). */
function tile(free: Interval[], slotMinutes: number): Interval[] {
  const slots: Interval[] = [];
  for (const f of free) {
    for (let s = f.start; s + slotMinutes <= f.end; s += slotMinutes) {
      slots.push({ start: s, end: s + slotMinutes });
    }
  }
  return slots;
}

export type ComputeAvailabilityInput = {
  date: string; // 'YYYY-MM-DD' (klinika-local kalendar kuni)
  doctorSegments: DoctorSegment[];
  branchWorkHours: BranchWorkHours;
  appointments: BusyAppointment[];
  timeOffs: BusyTimeOff[];
  slotMinutes: number;
};

/**
 * Berilgan kun uchun doktor bo'sh slot'lari.
 *
 * Sof funksiya — DB'siz testlanadi. Vaqt zonasi Asia/Tashkent (UTC+5).
 * branchWorkHours semantikasi (reports.aggregations bilan izchil):
 *   kalit yo'q → ochiq EMAS deb hisoblaymiz (availability'da yopiq — chunki
 *   ish-soatlari aniqlanmagan kunda slot taklif qilmaymiz).
 *   kalit null → yopiq. {open,close} → o'sha oraliq.
 */
export function computeAvailability(input: ComputeAvailabilityInput): AvailabilitySlot[] {
  const { date, doctorSegments, branchWorkHours, appointments, timeOffs, slotMinutes } = input;
  if (slotMinutes <= 0) return [];

  const weekday = weekdayOf(date);
  const key = WEEKDAY_KEYS[weekday];

  // 1. Branch ochiq oralig'i shu kunda.
  const branchEntry = branchWorkHours && key ? branchWorkHours[key] : undefined;
  if (!branchEntry) return []; // yopiq yoki sozlanmagan → slot yo'q
  const branchOpen: Interval = {
    start: hhmmToMinutes(branchEntry.open),
    end: hhmmToMinutes(branchEntry.close),
  };
  if (branchOpen.end <= branchOpen.start) return [];

  // 2. Doktor segmentlari shu kunda (weekday + effective oynasi + aktivlik).
  const segs = doctorSegments
    .filter((s) => s.weekday === weekday && inEffectiveWindow(s, date))
    .map((s) => ({ start: s.startMinute, end: s.endMinute }))
    .filter((s) => s.end > s.start);
  if (segs.length === 0) return [];

  // 3. base = intersect(branchOpen, har doktor segmenti).
  const base: Interval[] = [];
  for (const seg of segs) {
    const x = intersectOne(branchOpen, seg);
    if (x) base.push(x);
  }
  if (base.length === 0) return [];

  // 4. busy = appointmentlar ∪ time-off'lar — local daqiqaga, [0,1440)'ga clip.
  const busy: Interval[] = [];
  const pushClipped = (startAt: Date, endAt: Date) => {
    const s = Math.max(0, instantToLocalMinute(startAt, date));
    const e = Math.min(1440, instantToLocalMinute(endAt, date));
    if (e > s) busy.push({ start: s, end: e });
  };
  for (const a of appointments) pushClipped(a.startAt, a.endAt);
  for (const t of timeOffs) pushClipped(t.startAt, t.endAt);

  // 5. free = subtract(base, busy); 6. slots = tile.
  const free = subtract(base, busy);
  const tiled = tile(free, slotMinutes);

  return tiled.map((slot) => ({
    startMinute: slot.start,
    endMinute: slot.end,
    start: localMinuteToInstant(date, slot.start).toISOString(),
    end: localMinuteToInstant(date, slot.end).toISOString(),
  }));
}
