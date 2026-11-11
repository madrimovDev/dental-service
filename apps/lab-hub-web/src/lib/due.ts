export type DueKind = 'none' | 'overdue' | 'today' | 'tomorrow' | 'later';

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` ni mahalliy sana sifatida (soat/DST ta'siri yo'q) kun raqamiga aylantiradi. */
const dayNumber = (y: number, m: number, d: number) => Date.UTC(y, m, d) / DAY_MS;

/** Muddatgacha kunlar (mahalliy bugundan): manfiy = kechikkan. Chip rangi shu bilan belgilanadi. */
export function dueInfo(due: string | null | undefined, now: Date = new Date()) {
  if (!due) return { kind: 'none' as DueKind, days: 0 };
  const [y, m, d] = due.split('-').map(Number) as [number, number, number];
  const days = Math.round(
    dayNumber(y, m - 1, d) - dayNumber(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const kind: DueKind =
    days < 0 ? 'overdue' : days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'later';
  return { kind, days };
}

/** Mahalliy bugun `YYYY-MM-DD` (API `dueBefore` uchun). */
export const localISODate = (d: Date = new Date(), plusDays = 0) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusDays);
  const mm = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${mm}-${dd}`;
};
