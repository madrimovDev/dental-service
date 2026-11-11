import { sql } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import type { Database } from '../db/client.ts';

// Ichki sentinel: tranzaksiyani bekor qiladi, lekin tayyor javobni saqlaydi.
const ROLLBACK = Symbol('rls-rollback');

/**
 * RLS middleware — transaction-per-request + SET LOCAL app.current_tenant_id
 *
 * Postgres `SET LOCAL` faqat transaction ichida ishlaydi. Shuning uchun har
 * auth'lanagan request transaction ochadi. Service factories `c.get('db')`
 * orqali transaction-bound `db` ni oladi, hech qachon to'g'ridan-to'g'ri
 * `import { db }` qilmaydi.
 *
 * `activeTenantId` yo'q bo'lsa (public endpoint, hali workspace tanlanmagan):
 *   - Transaction ochilmaydi
 *   - `c.set('db', db)` (oddiy pool connection)
 *   - RLS-protected jadvalga query qilinsa, 0 row qaytaradi (xavfsiz default)
 */
export const rlsMiddleware =
  (db: Database): MiddlewareHandler =>
  async (c, next) => {
    const tenantId = c.get('activeTenantId');

    if (!tenantId) {
      // Platform-level kontekst (login, register, workspace switcher)
      c.set('db', db);
      await next();
      return;
    }

    // Tenant kontekst: transaction ochib SET LOCAL chaqirish
    let nextError: unknown;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
        c.set('db', tx);
        try {
          await next();
        } catch (err) {
          nextError = err;
          throw err; // rollback transaction
        }
        // Hono `app.onError` xatoni compose ichida yutadi (`await next()` throw
        // qilmaydi) — shuning uchun `c.error` yoki 5xx javobni o'zimiz tekshirib
        // rollback qilamiz (P1). `fail()` bilan qaytarilgan 4xx — COMMIT (qasddan).
        if (c.error || c.res.status >= 500) throw ROLLBACK;
      });
    } catch (err) {
      // Javob allaqachon `c.res`da — sentinel klientga oqib chiqmaydi.
      if (err === ROLLBACK) return;
      throw err;
    }
    if (nextError) throw nextError;
  };
