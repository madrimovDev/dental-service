import { tenantSettings } from '@dental/db-schema';
import type { Context } from 'hono';
import type { DbOrTx } from '../db/client.ts';

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

/** FT-04.3 (review): bemor chegirmasi tenant chegarasidan (`max_discount_percent`) oshdi. */
export class PatientDiscountExceedsMaxError extends Error {
  readonly code = 'patient.discount_exceeds_max';
  constructor(readonly maxPercent: number) {
    super(`Doimiy chegirma ${maxPercent}% dan oshmasligi kerak (tenant max_discount_percent)`);
    this.name = 'PatientDiscountExceedsMaxError';
  }
}

/** Tenant chegirma chegarasi (`tenant_settings.max_discount_percent`, default 100). RLS-bound db. */
export const readMaxDiscountPercent = async (db: DbOrTx): Promise<number> => {
  const [row] = await db
    .select({ maxDiscountPercent: tenantSettings.maxDiscountPercent })
    .from(tenantSettings)
    .limit(1);
  return row?.maxDiscountPercent ?? 100;
};

/**
 * FT-04.3 (review): bemorning doimiy chegirmasi tenant chegarasi bilan cheklanadi —
 * `min(pct, maxPct)`. Chegara keyinroq pasaytirilgan holat uchun himoya (yozishda
 * `pct > max` rad etiladi, chegara pasayganda bemorlar clamp qilinadi).
 */
export const capDiscountPercent = (
  pct: string | number | null | undefined,
  maxPct: number,
): string | null => {
  if (pct == null) return null;
  const capped = Math.min(Number(pct), maxPct);
  return capped > 0 ? capped.toFixed(2) : null;
};
