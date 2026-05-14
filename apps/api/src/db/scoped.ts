import type { Context } from 'hono';
import type { DbOrTx } from './client.ts';

/**
 * Context'dan transaction-bound `db` ni oladi (RLS middleware o'rnatgan).
 *
 * Service factories shu helper'ni ishlatishi shart — hech qachon to'g'ridan-to'g'ri
 * `import { db } from '../db/client.ts'`. Sabab: transaction ichidagi `SET LOCAL`
 * faqat tx-bound connection'da ishlaydi.
 *
 * Usage:
 * ```ts
 * app.get('/patients', async (c) => {
 *   const db = getDb(c);
 *   const result = await db.select().from(patients); // RLS avtomatik filterlanadi
 *   return c.json(ok(result));
 * });
 * ```
 */
export const getDb = (c: Context): DbOrTx => {
  const db = c.get('db');
  if (!db) {
    throw new Error(
      "No db in context — rlsMiddleware o'rnatishni unutgansiz. " +
        'Yoki public endpoint uchun rlsMiddleware(db) ni mount qiling.',
    );
  }
  return db;
};
