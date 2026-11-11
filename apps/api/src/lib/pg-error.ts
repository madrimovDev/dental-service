/**
 * Postgres xatosini ochish (unwrap).
 *
 * drizzle-orm (>=0.44) driver xatosini `DrizzleQueryError`ga o'raydi: SQLSTATE
 * (`code`) va `constraint_name` wrapper'da emas, `.cause`da. Eski `err.code`
 * tekshiruvlari hech qachon mos kelmasdi → race'dagi 23P01/23505 → 500.
 * Shu helper `.cause` zanjirini yuradi va birinchi SQLSTATE'li xatoni qaytaradi.
 */
export type PgErrorInfo = { code: string; constraint: string | null };

export function pgErrorInfo(err: unknown): PgErrorInfo | null {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && typeof cur === 'object' && cur !== null; depth++) {
    const e = cur as { code?: unknown; constraint_name?: unknown; constraint?: unknown };
    // SQLSTATE = 5 belgili (masalan '23P01'); Node errno kodlari ('ECONNRESET') o'tkazib yuboriladi.
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && !/^E[A-Z]+$/.test(e.code)) {
      const constraint =
        typeof e.constraint_name === 'string'
          ? e.constraint_name
          : typeof e.constraint === 'string'
            ? e.constraint
            : null;
      return { code: e.code, constraint };
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}
