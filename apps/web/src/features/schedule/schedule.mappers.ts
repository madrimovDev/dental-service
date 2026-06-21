import type { WorkingHoursSegment, WorkingHoursSegmentDto } from '@dental/api-client';
import type { EditableSegment, WeeklyHours } from './schedule.types';

const TZ = 'Asia/Tashkent';

/** Tahrir-segment uchun barqaror kalit (tarkib emas — reconciliation). */
export function newSegmentKey(): string {
  return crypto.randomUUID();
}

/** "HH:mm" → daqiqa (yarim tundan). */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Daqiqa (yarim tundan) → nol-bilan to'ldirilgan "HH:mm". */
export function minutesToHhmm(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Working-hours DTO[] → hafta kuni (0..6) bo'yicha guruhlangan tahrir-segmentlar.
 * Faqat `start`/`end` ("HH:mm") saqlanadi — tahrir holatining ichki modeli.
 */
export function groupSegmentsByWeekday(segments: WorkingHoursSegmentDto[]): WeeklyHours {
  const out: WeeklyHours = {};
  for (let wd = 0; wd <= 6; wd += 1) out[wd] = [];
  for (const s of segments) {
    const day = out[s.weekday] ?? [];
    day.push({ key: newSegmentKey(), start: s.start, end: s.end });
    out[s.weekday] = day;
  }
  return out;
}

/** Haftalik tahrir-model → PUT body segmentlari (bo'sh kunlar tushadi). */
export function toPutSegments(weekly: WeeklyHours): WorkingHoursSegment[] {
  const segs: WorkingHoursSegment[] = [];
  for (let wd = 0; wd <= 6; wd += 1) {
    for (const seg of weekly[wd] ?? []) {
      segs.push({ weekday: wd, start: seg.start, end: seg.end });
    }
  }
  return segs;
}

/**
 * To'liq kunlik time-off oralig'ini ('YYYY-MM-DD' .. 'YYYY-MM-DD', inklyuziv)
 * UTC instant chegaralariga aylantiradi (Asia/Tashkent = UTC+5, DST yo'q — Qaror #22).
 *
 *   startAt = startDate local 00:00 (`${startDate}T00:00:00+05:00`)
 *   endAt   = (endDate + 1 kun) local 00:00  — yarim-ochiq [start,end), oxirgi
 *             kun TO'LIQ qamraladi (backend overlap `startAt < end && endAt > start`).
 *
 * ⚠️ `new Date('2026-06-20').toISOString()` ISHLATMA — u UTC yarim tunni beradi
 * (= 05:00 Tashkent, 5 soat xato). `+05:00` suffiksi shart.
 */
export function fullDayRangeToInstants(
  startDate: string,
  endDate: string,
): { startAt: string; endAt: string } {
  const startAt = new Date(`${startDate}T00:00:00+05:00`);
  // endDate (inklyuziv) + 1 kun = yarim-ochiq eksklyuziv chegara.
  const endExclusive = new Date(`${endDate}T00:00:00+05:00`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  return { startAt: startAt.toISOString(), endAt: endExclusive.toISOString() };
}

/** UTC ISO instant → Asia/Tashkent "HH:mm" (slot chip yorlig'i). */
export function slotTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** Date → klinika-local 'YYYY-MM-DD' (Asia/Tashkent) — availability `date` parametri. */
export function localDateParam(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date);
}

export type { EditableSegment };
