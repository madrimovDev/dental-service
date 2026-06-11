/**
 * Reports sof agregatsiya helperlari — SQL'siz arifmetika (testlanadigan yadro).
 * Hafta-kuni kalit konvensiyasi: 'sun','mon','tue','wed','thu','fri','sat' (kichik harf).
 * (branches.workHours sxemasi kalitni majburlamaydi — bu modul shu konvensiyani qabul qiladi.)
 */
export const DEFAULT_WORK_MINUTES = 540; // 09:00–18:00

/** No-show foizi (0..1). total=0 → 0. */
export function noShowRate(noShow: number, total: number): number {
  return total === 0 ? 0 : noShow / total;
}

/** Bandlik foizi (0..1). capacity=0 → 0; booked>capacity → 1. */
export function utilizationPct(bookedMinutes: number, capacityMinutes: number): number {
  if (capacityMinutes <= 0) return 0;
  return Math.min(1, bookedMinutes / capacityMinutes);
}

/** Tugallanish foizi (0..1). total=0 → 0. */
export function completionRate(completed: number, total: number): number {
  return total === 0 ? 0 : completed / total;
}

/** "HH:MM" → daqiqa (yarim tundan). */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Branch ish-daqiqasi berilgan hafta kuni uchun.
 * - workHours null → defaultMinutes
 * - kalit yo'q → defaultMinutes (sozlanmagan kun)
 * - kalit null → 0 (yopiq kun)
 * - {open,close} → close − open (manfiy bo'lsa 0)
 */
export function branchOpenMinutes(
  workHours: Record<string, { open: string; close: string } | null> | null,
  weekday: string,
  defaultMinutes: number,
): number {
  if (!workHours) return defaultMinutes;
  if (!(weekday in workHours)) return defaultMinutes;
  const entry = workHours[weekday];
  if (entry == null) return 0;
  return Math.max(0, toMinutes(entry.close) - toMinutes(entry.open));
}
