const isRu = (lng: string) => lng.startsWith('ru');
const locale = (lng: string) => (isRu(lng) ? 'ru-RU' : 'uz-UZ');

// Chrome'ning `uz` ICU ma'lumotida oy nomlari to'liq emas («M11») — lotin yozuvini o'zimiz beramiz.
const UZ_MONTHS = [
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
const RU_MONTHS = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

export const formatMoney = (amount: string | number, lng: string, currency: string) => {
  const n = Number(amount);
  const s = new Intl.NumberFormat(locale(lng), { maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );
  return `${s} ${currency}`;
};

const dayMonth = (d: Date, lng: string) =>
  isRu(lng)
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(d)
    : `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}`;

/** `2026-11-18` -> «18-noyabr» / «18 ноября». */
export const formatDay = (iso: string, lng: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number) as [number, number, number];
  return dayMonth(new Date(y, m - 1, d), lng);
};

export const formatTime = (iso: string, lng: string) =>
  new Intl.DateTimeFormat(locale(lng), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));

/** «12-noyabr 10:30» */
export const formatDateTime = (iso: string, lng: string) =>
  `${dayMonth(new Date(iso), lng)} ${formatTime(iso, lng)}`;

/** `2026-11` -> «Noyabr 2026» / «Ноябрь 2026». */
export const formatMonth = (period: string, lng: string) => {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const name = (isRu(lng) ? RU_MONTHS : UZ_MONTHS)[m - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${y}`;
};

export const shiftMonth = (period: string, delta: number) => {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const kb = (bytes: number) => Math.max(1, Math.round(bytes / 1024));
