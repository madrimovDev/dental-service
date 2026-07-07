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

/** Recall samaradorligi (0..1) — converted (scheduled+completed) / total. total=0 → 0. */
export function recallEfficacy(converted: number, total: number): number {
  return total === 0 ? 0 : converted / total;
}

/** Retention foizi (0..1) — qaytgan / (yangi + qaytgan). jami=0 → 0. */
export function retentionRate(returning: number, newPatients: number): number {
  const total = returning + newPatients;
  return total === 0 ? 0 : returning / total;
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

// ─── DS12-A: Period-over-period comparison helpers ───────────────────────────

/** Foiz o'zgarishi (current vs baseline). baseline<=0 → null (ma'noli taqqoslash yo'q). */
export function deltaPct(current: number, baseline: number): number | null {
  if (baseline <= 0) return null;
  return ((current - baseline) / baseline) * 100;
}

/** Taqqoslash yozuvi — baseline 0/yo'q bo'lsa null (▲▼ render qilinmaydi). */
export function comparisonEntry(
  current: number,
  baseline: number,
): { total: number; deltaPct: number } | null {
  const d = deltaPct(current, baseline);
  return d === null ? null : { total: baseline, deltaPct: d };
}

/** Inclusive kun soni (YYYY-MM-DD). */
export function periodLengthDays(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** YYYY-MM-DD'ni N kun suradi (UTC anchor — TZ drift'siz). */
export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD'ni N yil suradi. */
export function shiftYears(date: string, years: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// ─── CLI-450: Xizmat margin hisoboti (BOM + avg-cost approksimatsiya) ────────

/** `service_materials` BOM qatori — sof kirish (Drizzle numeric ustunlar JS number'ga o'girilgan). */
export type ServiceMaterialRow = {
  serviceId: string;
  itemId: string;
  qtyPerService: number;
};

/**
 * BOM + item bo'yicha o'rtacha narx (`avgCostByItemId` — `stock_batches.costPerUnit`
 * o'rtachasi) dan xizmat uchun BITTA ijro (occurrence) narxini hisoblaydi.
 * v1 approksimatsiya (dokumentlashtirilgan cheklov): FIFO/batch-consumption tracking
 * yo'q; itemning hech qanday batchida cost yozilmagan bo'lsa (`avgCostByItemId`da
 * yo'q) — narxi 0.
 */
export function materialCostByService(
  bom: ServiceMaterialRow[],
  avgCostByItemId: Map<string, number>,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of bom) {
    const unitCost = avgCostByItemId.get(row.itemId) ?? 0;
    result.set(row.serviceId, (result.get(row.serviceId) ?? 0) + row.qtyPerService * unitCost);
  }
  return result;
}

/** Xizmat margin qatori — CLI-450 `procedureMix` javobi uchun. */
export type ServiceMarginRow = {
  serviceName: string;
  count: number;
  revenue: number;
  materialCost: number;
  margin: number;
  marginPct: number | null;
};

/**
 * Xizmat margin hisobi: `materialCost = materialCostPerOccurrence × count` (davr
 * ichida bajarilgan barcha ijrolar — `count` = xom `SUM(quantity)`, `netServiceAggregates`
 * bilan bir xil miqyos). `margin = revenue - materialCost`. `marginPct = margin / revenue`
 * (`revenue === 0` → `null`, ma'noli foiz yo'q).
 */
export function computeServiceMargin(
  serviceName: string,
  count: number,
  revenue: number,
  materialCostPerOccurrence: number,
): ServiceMarginRow {
  const materialCost = materialCostPerOccurrence * count;
  const margin = revenue - materialCost;
  const marginPct = revenue === 0 ? null : margin / revenue;
  return { serviceName, count, revenue, materialCost, margin, marginPct };
}
