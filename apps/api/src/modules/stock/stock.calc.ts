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

/** Harakat turiga qarab yangi qoldiq. in/adjustment(+) qo'shadi, out ayiradi. Manfiyga ruxsat (guard yo'q). */
export function applyMovement(
  current: number,
  type: 'in' | 'out' | 'adjustment',
  qty: number,
): number {
  if (type === 'out') return current - qty;
  return current + qty; // in, adjustment (+)
}
