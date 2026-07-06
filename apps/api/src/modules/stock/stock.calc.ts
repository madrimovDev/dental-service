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
