import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
// `seedAdminUser` imports `db`/`client` from `./client`, which eagerly opens
// its OWN separate postgres connection pool at import time (module-level
// `postgres(databaseUrl, { max: 10 })`). That pool is independent of `sql`
// below and was never closed — this is a release step meant to run once and
// exit (`docker compose run --rm migrate`, see infra/supervisor/docker-
// compose.prod.yml), so the leaked pool made the process hang forever after
// "Migrations done" instead of exiting. Import `client` too so we can close
// it alongside `sql` in `finally`.
import { client as seedClient } from './client';
import { seedAdminUser } from './seed';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sql = postgres(databaseUrl);
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations done');
  await seedAdminUser();
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
} finally {
  await sql.end();
  await seedClient.end();
}
