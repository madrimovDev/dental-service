import type { TFunction } from 'i18next';

const numberFmt = new Intl.NumberFormat('uz-UZ');

/** Pulni mahalliylashtirilgan suffix bilan: "1 234 567 so'm" / "...сум". */
export function formatCurrency(amount: number, t: TFunction): string {
  return `${numberFmt.format(Math.round(amount))} ${t('common.currency')}`;
}

/** Suffixsiz formatlangan raqam (jadval ustunlari/mapperlar uchun). */
export function formatNumber(amount: number): string {
  return numberFmt.format(Math.round(amount));
}
