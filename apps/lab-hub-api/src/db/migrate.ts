import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Lab Hub migratsiyasi (release qadami). Admin (superuser/egasi) ulanishi bilan:
 *  1. Drizzle migratsiyalari (`./drizzle`);
 *  2. runtime app rolini (NOSUPERUSER NOBYPASSRLS) yaratish + grant'lar —
 *     superuser RLS'ni chetlab o'tadi, shuning uchun runtime faqat shu rol bilan;
 *  3. RLS DDL (`migrations/rls/*.sql`, `_rls_migrations` jurnali).
 * apps/api/src/db/migrate.ts naqshi; env-yengil (KEK/JWT talab qilinmaydi).
 */

const adminUrl: string =
  process.env.DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  (() => {
    throw new Error('DATABASE_ADMIN_URL or DATABASE_URL must be set for migrations');
  })();

const APP_ROLE = process.env.LAB_HUB_APP_ROLE ?? 'lab_hub_app';
const APP_ROLE_PASSWORD = process.env.LAB_HUB_APP_DB_PASSWORD ?? 'lab_hub_app_local_dev';
if (!/^[a-z_][a-z0-9_]*$/.test(APP_ROLE)) throw new Error('LAB_HUB_APP_ROLE must be [a-z0-9_]');

const MIGRATIONS_FOLDER =
  process.env.MIGRATIONS_DIR ?? join(import.meta.dir, '..', '..', 'drizzle');
const RLS_DIR =
  process.env.RLS_MIGRATIONS_DIR ?? join(import.meta.dir, '..', '..', 'migrations', 'rls');

async function ensureDatabaseExists(url: string) {
  const dbName = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!dbName) return;
  const sysUrl = new URL(url);
  sysUrl.pathname = '/postgres';
  const sys = postgres(sysUrl.toString(), { max: 1 });
  try {
    const rows = await sys`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (rows.length === 0) await sys.unsafe(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  } finally {
    await sys.end();
  }
}

await ensureDatabaseExists(adminUrl);
const adminClient = postgres(adminUrl, { max: 1, onnotice: () => {} });
const adminDb = drizzle(adminClient);

async function ensureAppRole() {
  const existing = await adminDb.execute(sql`SELECT 1 FROM pg_roles WHERE rolname = ${APP_ROLE}`);
  if (existing.length === 0) {
    await adminDb.execute(
      sql.raw(
        `CREATE ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${APP_ROLE_PASSWORD.replace(/'/g, "''")}'`,
      ),
    );
  }
  // Har safar majburlanadi — rol oldindan (boshqa yo'l bilan) yaratilgan bo'lsa ham.
  await adminDb.execute(
    sql.raw(`ALTER ROLE ${APP_ROLE} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`),
  );
  const dbName = decodeURIComponent(new URL(adminUrl).pathname.slice(1));
  await adminDb.execute(sql.raw(`GRANT CONNECT ON DATABASE "${dbName}" TO ${APP_ROLE}`));
  await adminDb.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`));
  await adminDb.execute(
    sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`),
  );
  await adminDb.execute(
    sql.raw(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`),
  );
  // Jurnal jadvallari ilovaga kerak emas.
  await adminDb.execute(sql.raw(`REVOKE ALL ON TABLE _rls_migrations FROM ${APP_ROLE}`));
}

async function applyRls() {
  await adminDb.execute(sql`
    CREATE TABLE IF NOT EXISTS _rls_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const files = (await readdir(RLS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const done = await adminDb.execute(sql`SELECT 1 FROM _rls_migrations WHERE filename = ${file}`);
    if (done.length > 0) continue;
    await adminDb.execute(sql.raw(await readFile(join(RLS_DIR, file), 'utf8')));
    await adminDb.execute(sql`INSERT INTO _rls_migrations (filename) VALUES (${file})`);
    console.log(`RLS applied: ${file}`);
  }
}

try {
  await migrate(adminDb, { migrationsFolder: MIGRATIONS_FOLDER });
  await applyRls();
  await ensureAppRole();
  console.log('Lab Hub migrations done');
  await adminClient.end();
  process.exit(0);
} catch (err) {
  console.error('Lab Hub migration failed:', err);
  await adminClient.end();
  process.exit(1);
}
