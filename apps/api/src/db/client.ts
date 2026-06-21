import * as schema from '@dental/db-schema';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../lib/env.ts';

// Exported so graceful shutdown (index.ts / worker.ts) can drain the pool with
// `dbClient.end()` on SIGTERM/SIGINT.
export const dbClient = postgres(env.DATABASE_URL, {
  // M1 da multi-tenant RLS uchun transaction-per-request middleware ishlatamiz
  // Bu yerda default pool, request-level transaction o'rnatadi.
  max: 20,
  idle_timeout: 30,
});

export const db = drizzle(dbClient, { schema });

/** Top-level Database (pool connection) */
export type Database = typeof db;

/** Transaction instance — har RLS-scoped request bunda ishlaydi */
export type DbTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

/** Service factories shu type'ni qabul qiladi — pool yoki transaction farq qilmaydi */
export type DbOrTx = Database | DbTransaction;
