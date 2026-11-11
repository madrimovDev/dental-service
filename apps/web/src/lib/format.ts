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

// --- Sana nomlari ---------------------------------------------------------
// Headless Chromium / ba'zi Electron build'larida `uz` Intl ma'lumoti yo'q
// ("M11 12 · Thu"), shu sabab o'zbekcha oy/hafta kuni nomlari lug'atdan olinadi.
// Boshqa tillar (ru) Intl'dan.

const UZ_MONTHS_LONG = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];
const UZ_MONTHS_SHORT = [
  'yan',
  'fev',
  'mar',
  'apr',
  'may',
  'iyn',
  'iyl',
  'avg',
  'sen',
  'okt',
  'noy',
  'dek',
];
// Yakshanba'dan boshlanadi (Date#getUTCDay).
const UZ_WEEKDAYS_LONG = [
  'yakshanba',
  'dushanba',
  'seshanba',
  'chorshanba',
  'payshanba',
  'juma',
  'shanba',
];
const UZ_WEEKDAYS_SHORT = ['yak', 'dush', 'sesh', 'chor', 'pay', 'juma', 'shan'];

const isUz = (lang: string) => !lang.startsWith('ru');

/** `date`ning `timeZone`dagi kalendar kuni (Y/M/D + hafta kuni). */
function ymd(date: Date, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

/** "12-noyabr" (uz) / "12 ноября" (ru). `month: 'short'` — qisqa oy nomi. */
export function formatDayMonth(
  date: Date,
  lang: string,
  opts: { month?: 'long' | 'short'; timeZone?: string; padDay?: boolean } = {},
): string {
  const month = opts.month ?? 'long';
  if (isUz(lang)) {
    const p = ymd(date, opts.timeZone);
    const names = month === 'long' ? UZ_MONTHS_LONG : UZ_MONTHS_SHORT;
    const day = opts.padDay ? String(p.day).padStart(2, '0') : String(p.day);
    return `${day}-${names[p.month - 1]}`;
  }
  return new Intl.DateTimeFormat('ru-RU', {
    day: opts.padDay ? '2-digit' : 'numeric',
    month,
    timeZone: opts.timeZone,
  }).format(date);
}

/** "payshanba" / "pay" (uz); "четверг" / "чт" (ru). */
export function formatWeekday(
  date: Date,
  lang: string,
  style: 'long' | 'short' = 'long',
  timeZone?: string,
): string {
  if (isUz(lang)) {
    const { weekday } = ymd(date, timeZone);
    return (style === 'long' ? UZ_WEEKDAYS_LONG : UZ_WEEKDAYS_SHORT)[weekday] ?? '';
  }
  return new Intl.DateTimeFormat('ru-RU', { weekday: style, timeZone }).format(date);
}
