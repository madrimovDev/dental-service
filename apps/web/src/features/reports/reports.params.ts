/**
 * UI-M2 — davr, filial va savol URL'da (`?from&to&branch&q`); URL bo'sh bo'lsa oxirgi tanlov
 * localStorage'dan («tanlov saqlanadi»). Sof funksiyalar + yupqa storage.
 */
export type ReportParams = {
  from: string; // YYYY-MM-DD
  to: string;
  branchId: string | null;
  q: string | null;
};

const STORE_KEY = 'reports.prefs';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');
export const toLocalDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Oxirgi 30 kun (bugun bilan). */
export const defaultPeriod = (now = new Date()): { from: string; to: string } => {
  const from = new Date(now);
  from.setDate(from.getDate() - 29);
  return { from: toLocalDate(from), to: toLocalDate(now) };
};

export const fromLocalDate = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

export function parseReportParams(
  sp: URLSearchParams,
  stored: Partial<ReportParams> | null,
  now = new Date(),
): ReportParams {
  const pick = (key: 'from' | 'to'): string | null => {
    const v = sp.get(key) ?? stored?.[key] ?? null;
    return v && DATE_RE.test(v) ? v : null;
  };
  const def = defaultPeriod(now);
  let from = pick('from') ?? def.from;
  let to = pick('to') ?? def.to;
  if (from > to) [from, to] = [to, from];
  return {
    from,
    to,
    branchId: sp.get('branch') ?? stored?.branchId ?? null,
    q: sp.get('q') ?? stored?.q ?? null,
  };
}

export function toSearchParams(p: ReportParams): URLSearchParams {
  const sp = new URLSearchParams({ from: p.from, to: p.to });
  if (p.branchId) sp.set('branch', p.branchId);
  if (p.q) sp.set('q', p.q);
  return sp;
}

export const readStoredParams = (): Partial<ReportParams> | null => {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Partial<ReportParams>) : null;
  } catch {
    return null;
  }
};

export const writeStoredParams = (p: ReportParams): void => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    // storage mavjud emas — URL yetarli
  }
};
