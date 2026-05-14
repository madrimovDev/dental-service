import * as schema from '@dental/db-schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../lib/env.ts';

const queryClient = postgres(env.DATABASE_URL, {
  // M1 da multi-tenant RLS uchun transaction-per-request middleware ishlatamiz
  // Bu yerda default pool, request-level transaction o'rnatadi.
  max: 20,
  idle_timeout: 30,
});

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;
