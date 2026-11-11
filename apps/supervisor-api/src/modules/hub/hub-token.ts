import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Supervisor ↔ Lab Hub umumiy ichki tokeni (`SUPERVISOR_HUB_TOKEN`, ≥32 bayt).
 * So'rov paytida o'qiladi — sozlanmagan bo'lsa Hub bilan bog'liq yo'llar 503.
 */
export const hubToken = (): string | null => {
  const t = process.env.SUPERVISOR_HUB_TOKEN;
  return t && Buffer.byteLength(t) >= 32 ? t : null;
};

const h = (v: string) => createHash('sha256').update(v).digest();
export const tokenMatches = (given: string | undefined, expected: string): boolean =>
  !!given && timingSafeEqual(h(given), h(expected));
