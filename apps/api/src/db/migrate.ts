import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { logger } from '../lib/logger.ts';

// Migrate task DATABASE_ADMIN_URL ishlatadi (superuser).
// App runtime esa DATABASE_URL (non-superuser) — bu farq RLS to'liq ishlashi uchun.
const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
if (!adminUrl) {
  throw new Error('DATABASE_ADMIN_URL or DATABASE_URL must be set for migrations');
}

const adminClient = postgres(adminUrl, { max: 1 });
const adminDb = drizzle(adminClient);

async function applyRlsMigrations() {
  const rlsDir = join(import.meta.dir, '..', '..', 'migrations', 'rls');
  let files: string[];
  try {
    files = await readdir(rlsDir);
  } catch {
    logger.info('No RLS migrations directory, skipping');
    return;
  }

  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();
  for (const file of sqlFiles) {
    const path = join(rlsDir, file);
    const ddl = await readFile(path, 'utf8');
    logger.info({ file }, 'Applying RLS migration');
    await adminDb.execute(sql.raw(ddl));
  }
  logger.info({ count: sqlFiles.length }, 'RLS migrations applied');
}

async function runMigrations() {
  try {
    logger.info('Running Drizzle migrations (admin role)...');
    await migrate(adminDb, { migrationsFolder: './drizzle' });
    logger.info('Drizzle migrations completed');

    await applyRlsMigrations();

    logger.info('All migrations done');
    await adminClient.end();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  }
}

await runMigrations();
