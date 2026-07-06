import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

export const client = postgres(databaseUrl, { max: 10 });
export const db = drizzle(client, { schema }); // <-- schema MAJBURIY
export type Database = typeof db;
