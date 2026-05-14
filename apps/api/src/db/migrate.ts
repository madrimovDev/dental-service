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

  // Tracking table — qaysi RLS fayllar apply qilingani
  await adminDb.execute(sql`
    CREATE TABLE IF NOT EXISTS _rls_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  let skipped = 0;

  for (const file of sqlFiles) {
    const existing = await adminDb.execute(
      sql`SELECT filename FROM _rls_migrations WHERE filename = ${file}`,
    );
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const path = join(rlsDir, file);
    const ddl = await readFile(path, 'utf8');
    logger.info({ file }, 'Applying RLS migration');
    await adminDb.execute(sql.raw(ddl));
    await adminDb.execute(sql`INSERT INTO _rls_migrations (filename) VALUES (${file})`);
    applied++;
  }
  logger.info({ applied, skipped, total: sqlFiles.length }, 'RLS migrations done');
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
