import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { logger } from '../lib/logger.ts';
import { db } from './client.ts';

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
    // sql.raw — DDL'da parameter binding bo'lmaydi, faqat trusted internal source
    await db.execute(sql.raw(ddl));
  }
  logger.info({ count: sqlFiles.length }, 'RLS migrations applied');
}

async function runMigrations() {
  try {
    logger.info('Running Drizzle migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    logger.info('Drizzle migrations completed');

    await applyRlsMigrations();

    logger.info('All migrations done');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  }
}

await runMigrations();
