import type { Context } from 'hono';

/** FT-04 (D-1): chegirma berish huquqi — `discount.give` yoki tenant owner (`@owner`). */
export const canGiveDiscount = (c: Context): boolean => {
  const perms = c.get('accessClaims')?.perms ?? [];
  return perms.includes('@owner') || perms.includes('discount.give');
};

export const DISCOUNT_FORBIDDEN_CODE = 'discount.forbidden';
export const DISCOUNT_FORBIDDEN_MESSAGE = "Chegirma berish uchun ruxsat yo'q (discount.give)";

/**
 * FT-04.3 (D-2): bemorning doimiy chegirmasi bilan bosqich narxi snapshot'i.
 * `cost = round(price × (1 − pct/100))` (butun so'm; foiz 2 xonagacha butun-son arifmetikada),
 * `listPrice` = chegirmagacha narx, `discountPercent` — chegirma bo'lsa '10.00', aks holda null.
 * Faqat YANGI bosqich yaratishda chaqiriladi (mavjud bosqichlar retroaktiv o'zgarmaydi).
 */
export const applyDefaultDiscount = (
  price: number,
  pct: string | number | null | undefined,
): { cost: number; listPrice: string; discountPercent: string | null } => {
  const basisPoints = pct == null ? 0 : Math.round(Number(pct) * 100);
  if (!(basisPoints > 0)) {
    return { cost: price, listPrice: price.toFixed(2), discountPercent: null };
  }
  return {
    cost: Math.round((price * (10_000 - basisPoints)) / 10_000),
    listPrice: price.toFixed(2),
    discountPercent: (basisPoints / 100).toFixed(2),
  };
};
