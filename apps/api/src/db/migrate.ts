import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import pino from 'pino';
import postgres from 'postgres';

// Standalone logger reading directly from process.env — deliberately does NOT
// import lib/logger.ts (which pulls in the FULL env schema via env.ts). The
// migration is a release step that runs with an env-LIGHT set (only DATABASE_*),
// so it must not require JWT_SECRET / REDIS_URL / MINIO_* to boot. (D4 / D6.)
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

// Migrate task DATABASE_ADMIN_URL ishlatadi (superuser).
// App runtime esa DATABASE_URL (non-superuser) — bu farq RLS to'liq ishlashi uchun.
// `string` (not `| undefined`) — pastdagi funksiyalar closure orqali ishlatadi,
// guard'dan keyin ham narrowing saqlanishi uchun IIFE bilan tip kafolatlanadi.
const adminUrl: string =
  process.env.DATABASE_ADMIN_URL ??
  process.env.DATABASE_URL ??
  (() => {
    throw new Error('DATABASE_ADMIN_URL or DATABASE_URL must be set for migrations');
  })();

// Local Desktop first-run: `initdb -U dental` yaratadigan klasterda `dental`
// NOMLI DATABASE yo'q (initdb faqat superuser rolini shu nom bilan yaratadi —
// standart `postgres`/`template0`/`template1` databaselari bor, xolos).
// Cloud/dev deploymentda DB allaqachon mavjud (docker-compose init script) —
// bu tekshiruv arzon (bitta SELECT) va idempotent, universal qo'shildi.
async function ensureDatabaseExists(url: string): Promise<void> {
  const target = new URL(url);
  const dbName = decodeURIComponent(target.pathname.slice(1));
  if (!dbName) return;
  const sysUrl = new URL(url);
  sysUrl.pathname = '/postgres';
  const sysClient = postgres(sysUrl.toString(), { max: 1 });
  try {
    const rows = await sysClient`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (rows.length === 0) {
      logger.info({ dbName }, "Target database yo'q — yaratilmoqda (Local Desktop first-run)");
      await sysClient.unsafe(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    }
  } finally {
    await sysClient.end();
  }
}

await ensureDatabaseExists(adminUrl);

const adminClient = postgres(adminUrl, { max: 1 });
const adminDb = drizzle(adminClient);

// ⚠️ XAVFSIZLIK (2026-07-02 topildi): RLS-only tenant izolyatsiyasi FAQAT
// non-superuser role orqali ulanganda ishlaydi — superuser Postgres'da RLS'ni
// avtomatik CHETLAB O'TADI. Cloud/dev'da bu ajratish `infra/postgres-init.sh`
// orqali (Docker birinchi ishga tushishda) qilingan, lekin Local Desktop
// first-run `initdb`dan keyin FAQAT superuser (`dental`) mavjud edi —
// `dental_app` roli hech qachon yaratilmagan, ya'ni desktop API runtime
// ulanishi (agar shu yerda tuzatilmasa) superuser orqali RLS'ni butunlay
// chetlab o'tgan bo'lardi (barcha tenant ma'lumotlari hamma tenant uchun
// ko'rinadigan bo'lib qolardi). `postgres-init.sh`dagi bilan bir xil
// pattern, idempotent (allaqachon mavjud bo'lsa — cloud/dev — hech narsa
// qilmaydi).
const APP_ROLE = 'dental_app';
const APP_ROLE_PASSWORD = process.env.DENTAL_APP_DB_PASSWORD ?? 'dental_app_local_dev';

async function ensureAppRole(): Promise<void> {
  const existing = await adminDb.execute(sql`SELECT 1 FROM pg_roles WHERE rolname = ${APP_ROLE}`);
  if (existing.length === 0) {
    logger.info({ role: APP_ROLE }, "App (non-superuser, NOBYPASSRLS) role yo'q — yaratilmoqda");
    await adminDb.execute(
      sql.raw(
        `CREATE ROLE ${APP_ROLE} WITH LOGIN PASSWORD '${APP_ROLE_PASSWORD.replace(/'/g, "''")}'`,
      ),
    );
    await adminDb.execute(
      sql.raw(`ALTER ROLE ${APP_ROLE} NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`),
    );
  }

  // ⚠️ Grant'lar rol yaratilishidan MUSTAQIL qo'llanadi. Rol Postgres'da
  // KLASTER darajasida yashaydi, grant'lar esa BAZA darajasida — "rol bor"
  // dan "grant'lar berilgan" kelib chiqmaydi. Ilgari ikkalasi bitta erta
  // `return` ortida edi: shu klasterda ikkinchi baza yaratilsa (dev'da e2e
  // bazasi, desktop'da baza tiklash/qayta yaratish) rol allaqachon mavjud
  // bo'lgani uchun grant bosqichi butunlay o'tkazib yuborilardi va API
  // boot'da `permission denied for table permissions` bilan yiqilardi.
  // GRANT'lar idempotent — har migratsiyada qayta berilishi xavfsiz.
  const dbName = decodeURIComponent(new URL(adminUrl).pathname.slice(1));
  await adminDb.execute(sql.raw(`GRANT CONNECT ON DATABASE "${dbName}" TO ${APP_ROLE}`));
  await adminDb.execute(sql.raw(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`));
  await adminDb.execute(
    sql.raw(
      `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`,
    ),
  );
  await adminDb.execute(
    sql.raw(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`),
  );
  // Drizzle migratsiyalari `dental` (superuser) bilan yaratadigan KELAJAKDAGI
  // jadvallar uchun ham avtomatik ruxsat.
  await adminDb.execute(
    sql.raw(
      `ALTER DEFAULT PRIVILEGES FOR ROLE dental IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLES TO ${APP_ROLE}`,
    ),
  );
  await adminDb.execute(
    sql.raw(
      `ALTER DEFAULT PRIVILEGES FOR ROLE dental IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE}`,
    ),
  );
}

// `./drizzle` (CWD-relative) va `import.meta.dir` (source-file-relative) —
// ikkalasi ham normal dev/cloud (bun run db:migrate, CWD har doim apps/api/)
// uchun to'g'ri, lekin `bun build --compile`da BUZILADI: kompilyatsiya
// qilingan binary'ning `import.meta.dir`i virtual `/$bunfs/root/` nom
// fazosiga ishora qiladi, real fayl tizimidagi `drizzle/`/`migrations/rls/`
// papkalarni topolmaydi (Local Desktop `api.exe`, 2026-07-02 real-run'da
// topildi — "Can't find meta/_journal.json"). Desktop first-run.ts shu ikki
// env var orqali binary'ning haqiqiy joylashuviga nisbatan yo'l beradi
// (`join(dirname(apiExePath), 'drizzle')` va `.../migrations/rls`); normal
// ishlatishda bu env'lar o'rnatilmagan — mavjud xulq o'zgarmaydi.
const MIGRATIONS_FOLDER = process.env.MIGRATIONS_DIR ?? './drizzle';
const RLS_MIGRATIONS_DIR =
  process.env.RLS_MIGRATIONS_DIR ?? join(import.meta.dir, '..', '..', 'migrations', 'rls');

async function applyRlsMigrations() {
  const rlsDir = RLS_MIGRATIONS_DIR;
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
    await migrate(adminDb, { migrationsFolder: MIGRATIONS_FOLDER });
    logger.info('Drizzle migrations completed');

    await ensureAppRole();
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
