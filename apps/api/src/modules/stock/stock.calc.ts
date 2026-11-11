/**
 * Ombor sof hisoblash helperlari (DB'siz, sof funksiyalar).
 *
 * Diqqat: stock_items.quantity / min_threshold — numeric(14,2) → Drizzle string qaytaradi.
 * Bu funksiyalarni chaqirishdan oldin `Number(...)` qiling (string'da `<` leksik solishtiradi).
 */

/** Qoldiq min chegaradan QAT'IY past bo'lsa — kam-qoldi. Aynan chegarada — kam-qoldi EMAS. */
export function isLowStock(quantity: number, minThreshold: number): boolean {
  return quantity < minThreshold;
}

/**
 * Harakat turiga qarab yangi qoldiq.
 *  - `in`  → qo'shadi (`current + qty`)
 *  - `out` → ayiradi (`current - qty`); manfiyga ruxsat (guard yo'q — chaqiruvchida)
 *  - `adjustment` → SET-TO-VALUE (inventarizatsiya): `qty` = aniqlangan (sanalgan) qoldiq,
 *    yangi qoldiq = `qty` (o'zi). Delta uchun `adjustmentDelta` (movement ledger).
 */
export function applyMovement(
  current: number,
  type: 'in' | 'out' | 'adjustment',
  qty: number,
): number {
  if (type === 'out') return current - qty;
  if (type === 'adjustment') return qty; // set-to-value (stocktake)
  return current + qty; // in
}

/**
 * Inventarizatsiya (adjustment) uchun ledger delta — sanalgan qoldiq (`target`) va
 * joriy qoldiq (`current`) o'rtasidagi imzoli farq. `stock_movements.quantity`ga
 * shu yoziladi (masalan 100→90 → `-10`). Manfiy bo'lishi mumkin.
 */
export function adjustmentDelta(current: number, target: number): number {
  return target - current;
}

/** «Necha kunga yetadi» hisoblanadigan oyna (kun) — oxirgi 30 kun o'rtacha kunlik sarf. */
export const USAGE_WINDOW_DAYS = 30;

/**
 * O'rtacha kunlik sarf = oxirgi `USAGE_WINDOW_DAYS` kundagi sof sarf ÷ oyna.
 * Manfiy sof sarf (qaytarishlar ko'p) → 0.
 */
export function avgDailyUsage(netConsumed: number, windowDays = USAGE_WINDOW_DAYS): number {
  if (!(netConsumed > 0) || windowDays <= 0) return 0;
  return netConsumed / windowDays;
}

/**
 * «Necha kunga yetadi» = qoldiq ÷ o'rtacha kunlik sarf (butun kunga pastga yaxlitlanadi).
 *  - sarf 0 (yoki yo'q) → `null` (cheksiz / «—»; nolga bo'lish YO'Q)
 *  - qoldiq ≤ 0 → 0
 */
export function daysOfSupply(quantity: number, dailyUsage: number): number | null {
  if (!(dailyUsage > 0)) return null;
  if (!(quantity > 0)) return 0;
  return Math.floor(quantity / dailyUsage + 1e-9);
}

/**
 * Partiya qoldig'i — LIGHTWEIGHT model (Qaror #31): partiya bo'yicha sarf yozilmaydi, shuning
 * uchun item qoldig'i FIFO bilan taqsimlanadi — eng eski partiya birinchi sarflanadi, qoldiq
 * eng YANGI partiyalarda turadi. `batches` ixtiyoriy tartibda; natija `receivedAt` bo'yicha
 * yangidan eskiga taqsimlangan `qtyRemaining` bilan (kirish tartibi saqlanadi).
 */
export function allocateBatchRemaining<T extends { receivedAt: Date; qtyReceived: number }>(
  itemQuantity: number,
  batches: T[],
): Array<T & { qtyRemaining: number }> {
  let left = Math.max(0, itemQuantity);
  const newestFirst = [...batches].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  const remaining = new Map<T, number>();
  for (const b of newestFirst) {
    const take = Math.min(b.qtyReceived, left);
    remaining.set(b, take);
    left -= take;
  }
  return batches.map((b) => ({ ...b, qtyRemaining: remaining.get(b) ?? 0 }));
}
