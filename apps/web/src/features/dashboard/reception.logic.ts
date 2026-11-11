/** UI-R1 «Bugun» sof mantiq — hook YO'Q (testlanadi). */

export interface AttentionItem {
  key: string;
  tier: 2 | 3;
  title: string;
  text: string;
  actionLabel: string;
  to: string;
}

export const ATTENTION_LIMIT = 3;

/** Diqqat paneli: darajasi bo'yicha (2 oldin, 3 keyin) tartiblanadi, ≤3 + «yana N ta». */
export function limitAttention(items: AttentionItem[]): { shown: AttentionItem[]; more: number } {
  const sorted = [...items].sort((a, b) => a.tier - b.tier);
  return {
    shown: sorted.slice(0, ATTENTION_LIMIT),
    more: Math.max(0, sorted.length - ATTENTION_LIMIT),
  };
}

/** Kutish daqiqalari (kelajak/yaroqsiz sana → undefined). */
export function waitMinutes(createdAt: string | undefined, now: number): number | undefined {
  if (!createdAt) return undefined;
  const ms = now - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return Math.floor(ms / 60000);
}

export type StatusFilter = 'all' | 'pending' | 'in_progress' | 'completed' | 'no_show';
export const STATUS_FILTERS: StatusFilter[] = [
  'all',
  'pending',
  'in_progress',
  'completed',
  'no_show',
];

export function parseStatusFilter(v: string | null): StatusFilter {
  return (STATUS_FILTERS as string[]).includes(v ?? '') ? (v as StatusFilter) : 'all';
}

export function matchesStatusFilter(status: string, f: StatusFilter): boolean {
  if (f === 'all') return true;
  if (f === 'pending') return status === 'scheduled' || status === 'confirmed';
  return status === f;
}

export type RowAction = 'to_queue' | 'to_cashier' | 'rebook' | null;

/** Har qatorda BITTA keyingi amal. */
export function nextAction(status: string): RowAction {
  switch (status) {
    case 'scheduled':
    case 'confirmed':
      return 'to_queue';
    case 'in_progress':
    case 'completed':
      return 'to_cashier';
    case 'no_show':
      return 'rebook';
    default:
      return null;
  }
}

/** Overdue lab: kutilgan sana o'tgan va hali yetkazilmagan. today = "YYYY-MM-DD". */
export function isLabOverdue(
  o: { expectedDate: string | null; status: string },
  today: string,
): boolean {
  return (
    !!o.expectedDate &&
    o.status !== 'delivered' &&
    o.status !== 'cancelled' &&
    o.expectedDate.slice(0, 10) < today
  );
}
