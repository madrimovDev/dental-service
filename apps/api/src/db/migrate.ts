import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { logger } from '../lib/logger.ts';
import { db } from './client.ts';

async function runMigrations() {
  try {
    logger.info('Running migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    logger.info('Migrations completed');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Migration failed');
    process.exit(1);
  }
}

await runMigrations();
