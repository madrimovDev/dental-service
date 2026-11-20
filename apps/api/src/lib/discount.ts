import type { Context } from 'hono';

/** FT-04 (D-1): chegirma berish huquqi — `discount.give` yoki tenant owner (`@owner`). */
export const canGiveDiscount = (c: Context): boolean => {
  const perms = c.get('accessClaims')?.perms ?? [];
  return perms.includes('@owner') || perms.includes('discount.give');
};

export const DISCOUNT_FORBIDDEN_CODE = 'discount.forbidden';
export const DISCOUNT_FORBIDDEN_MESSAGE = "Chegirma berish uchun ruxsat yo'q (discount.give)";
