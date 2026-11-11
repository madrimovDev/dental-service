/**
 * Laboratoriyalar ro'yxati (lab portali hali yo'q): oldingi buyurtmalardan nom bo'yicha
 * guruhlanadi. `labs` obyekti yo'q — kalit nom (katta-kichik harf va ortiqcha bo'sh joyga befarq).
 */
export type LabOrderLike = {
  labName: string;
  status: string;
  sentDate?: string | null;
  deliveredDate?: string | null;
  remakeOfId?: string | null;
};

export type LabSummary = {
  name: string;
  count: number;
  /** O'rtacha yetkazish muddati (kun) — faqat yetkazilgan buyurtmalardan; yo'q bo'lsa null. */
  avgDays: number | null;
  /** Remake (qayta tayyorlash) ulushi, butun foiz. */
  remakePct: number;
};

const DAY_MS = 86_400_000;

export function summarizeLabs(orders: readonly LabOrderLike[]): LabSummary[] {
  const groups = new Map<string, { name: string; list: LabOrderLike[] }>();
  for (const o of orders) {
    const name = o.labName.trim().replace(/\s+/g, ' ');
    if (!name || o.status === 'cancelled') continue;
    const key = name.toLowerCase();
    const g = groups.get(key);
    if (g) g.list.push(o);
    else groups.set(key, { name, list: [o] });
  }
  return [...groups.values()]
    .map(({ name, list }) => {
      const spans = list
        .filter((o) => o.status === 'delivered' && o.sentDate && o.deliveredDate)
        .map(
          (o) =>
            (new Date(o.deliveredDate as string).getTime() -
              new Date(o.sentDate as string).getTime()) /
            DAY_MS,
        )
        .filter((d) => Number.isFinite(d) && d >= 0);
      const avgDays = spans.length
        ? Math.round(spans.reduce((a, b) => a + b, 0) / spans.length)
        : null;
      const remakes = list.filter((o) => o.remakeOfId).length;
      return {
        name,
        count: list.length,
        avgDays,
        remakePct: Math.round((remakes / list.length) * 100),
      };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
