import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Factory — modul darajasida singleton YO'Q (testlar va worker o'z ulanishini
 * quradi). Runtime ulanish non-superuser rol bilan bo'lishi SHART: superuser
 * RLS'ni chetlab o'tadi (`migrate.ts` → `ensureAppRole`).
 */
export const createDb = (url: string, max = 10) => {
  const client = postgres(url, { max });
  const db = drizzle(client, { schema });
  return { client, db };
};

export type Database = ReturnType<typeof createDb>['db'];
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export type DbOrTx = Database | Tx;
