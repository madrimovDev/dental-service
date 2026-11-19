import type { Context } from 'hono';
import { getTxAfterCommit } from '../../db/after-commit.ts';
import type { DbOrTx } from '../../db/client.ts';

/**
 * HTTP so'rovsiz (bot) kontekstda `Context` kutadigan service'larni (schedule
 * availability, appointments.update, audit) chaqirish uchun minimal Hono-Context
 * o'rami. Faqat `get()` (db, activeTenantId) va `req.header()` ishlatiladi —
 * service'lar shundan boshqasini o'qimaydi. `user` yo'q → audit `userId=null`
 * (bemor Telegram orqali harakat qilmoqda, xodim emas).
 */
export function createBotContext(tx: DbOrTx, tenantId: string): Context {
  const store: Record<string, unknown> = {
    db: tx,
    activeTenantId: tenantId,
    activeBranchId: null,
    // FX-75: `onAfterCommit` darhol emas — `withTenant` commit'dan keyin bajaradi.
    afterCommit: getTxAfterCommit(tx),
  };
  const fake = {
    get: (k: string) => store[k],
    set: (k: string, v: unknown) => {
      store[k] = v;
    },
    req: { header: (n: string) => (n.toLowerCase() === 'user-agent' ? 'telegram-bot' : undefined) },
  };
  return fake as unknown as Context;
}
