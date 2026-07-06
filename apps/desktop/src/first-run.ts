/**
 * Birinchi ishga tushirish (first-run) — portable Postgres uchun initdb,
 * ma'lumot papkalarini yaratish va konfiguratsiya fayllarini joylashtirish
 * (CLI-346, Task 7).
 *
 * Postgres/Valkey binary'lar: Windows'da `resources/postgres/bin/*.exe` +
 * `resources/valkey/*.exe` (portable, NSIS bilan bundled — CLI-350). Linux/
 * macOS'da BUNDLED binary yo'q (production faqat Windows'ga mo'ljallangan) —
 * shu sabab tizimga o'rnatilgan `postgres`/`initdb`/`valkey-server`ni PATH
 * orqali ishlatamiz. Bu FAQAT dev/test maqsadida (jismoniy Windows PC bo'lmasa
 * ham to'liq server-rejim oqimini haqiqiy binary bilan sinash uchun).
 */

import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';

const getResourcesDir = (): string =>
  app.isPackaged ? process.resourcesPath : join(import.meta.dirname, '..', 'resources');

const getDataDir = (): string =>
  process.env.DENTAL_DATA_DIR ||
  (process.platform === 'win32' ? 'C:\\ProgramData\\DentalService' : '/var/lib/dental-service');

const getPgDataDir = (): string => join(getDataDir(), 'postgres', 'data');

// Windows: portable binary resources/postgres/bin/initdb.exe. Boshqa
// platformalar (dev/test): tizim PATH'idan `initdb` (bundled binary yo'q).
const getInitdbPath = (): string =>
  process.platform === 'win32'
    ? join(getResourcesDir(), 'postgres', 'bin', 'initdb.exe')
    : 'initdb';

// Windows uchun Windows-tuned conf (posix_fadvise yo'q — effective_io_concurrency=0
// kerak), boshqa platformalar uchun Linux-tuned variant (200 ishlatadi).
const getConfFileNames = (): { postgres: string; valkey: string } =>
  process.platform === 'win32'
    ? { postgres: 'postgres-win.conf', valkey: 'valkey-win.conf' }
    : { postgres: 'postgres-linux.conf', valkey: 'valkey-linux.conf' };

export const isFirstRun = (): boolean => !existsSync(join(getPgDataDir(), 'PG_VERSION'));

const assertSuccess = (result: SpawnSyncReturns<Buffer>, label: string): void => {
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${result.stderr?.toString() ?? 'unknown error'}`);
  }
};

// API `env-schema.ts`ning JWT_SECRET (min 32 belgi) talabini qanoatlantiruvchi
// tasodifiy kalit — birinchi ishga tushishda generatsiya qilinadi va
// `dataDir`da saqlanadi (fingerprint kabi kompyuterga bog'liq emas, chunki
// litsenziya kaliti Supervisor tomonidan tekshiriladi — bu faqat mahalliy
// JWT imzosi uchun, boshqa qurilmaga ko'chirilishi muammo emas). Idempotent —
// mavjud bo'lsa shunchaki o'qiladi, birinchi chaqiruvda yaratiladi.
export const getJwtSecretPath = (): string => join(getDataDir(), 'jwt-secret.txt');

export const getOrCreateJwtSecret = (): string => {
  const path = getJwtSecretPath();
  if (existsSync(path)) {
    return readFileSync(path, 'utf8').trim();
  }
  mkdirSync(getDataDir(), { recursive: true });
  const secret = randomBytes(32).toString('hex'); // 64 hex belgi — 32+ talabidan ancha uzun
  writeFileSync(path, secret, { mode: 0o600 });
  return secret;
};

// dental_app Postgres roli uchun parol — birinchi ishga tushishda
// generatsiya qilinadi va `dataDir`da saqlanadi (CLI-390). getOrCreateJwtSecret
// bilan bir xil idempotent fayl-persist pattern.
export const getDbPasswordPath = (): string => join(getDataDir(), 'db-password.txt');

export const getOrCreateDbPassword = (): string => {
  const path = getDbPasswordPath();
  if (existsSync(path)) {
    return readFileSync(path, 'utf8').trim();
  }
  mkdirSync(getDataDir(), { recursive: true });
  // Upgrade-safety (CLI-390): agar bu birinchi chaqiruv paytida Postgres
  // klasteri ALLAQACHON mavjud bo'lsa (isFirstRun() false — bu kod
  // versiyasidan OLDIN o'rnatilgan nusxa, dental_app roli eski hardcoded
  // parol bilan allaqachon yaratilgan) — tasodifiy YANGI parol generatsiya
  // qilib bo'lmaydi (mavjud rol paroliga mos kelmay, runtime auth-failure
  // beradi). Faqat haqiqiy fresh install (Postgres klasteri hali yo'q)da
  // tasodifiy parol xavfsiz. Chaqiruvchi tomonidan bu funksiya initdb'dan
  // OLDIN chaqirilishi SHART (runFirstSetup() qarang) — aks holda fresh
  // install ham noto'g'ri "mavjud o'rnatish" filialiga tushib qoladi.
  const password = isFirstRun() ? randomBytes(32).toString('hex') : 'dental_app_local_dev';
  writeFileSync(path, password, { mode: 0o600 });
  return password;
};

export const runFirstSetup = (): void => {
  const dataDir = getDataDir();
  const pgData = getPgDataDir();
  const resourcesDir = getResourcesDir();
  const confNames = getConfFileNames();

  // 1. Ma'lumotlar papkalarini yaratish
  mkdirSync(join(dataDir, 'uploads'), { recursive: true });
  mkdirSync(join(dataDir, 'logs'), { recursive: true });
  mkdirSync(pgData, { recursive: true });

  // 2. DB parolini generatsiya qilish/aniqlash — initdb'DAN OLDIN (CLI-390:
  //    isFirstRun() PG_VERSION borligiga tayanadi, initdb esa aynan shu
  //    faylni yaratadi — tartib teskari bo'lsa fresh install ham "mavjud
  //    o'rnatish" deb noto'g'ri aniqlanib qoladi).
  getOrCreateDbPassword();

  // 3. initdb — postgres data dir yaratish
  const initdb = spawnSync(
    getInitdbPath(),
    ['-D', pgData, '--encoding=UTF8', '--locale=C', '-U', 'dental'],
    { stdio: 'pipe' },
  );
  assertSuccess(initdb, 'initdb');

  // 4. postgres.conf / valkey.conf nusxalash (platform-mos)
  copyFileSync(
    join(resourcesDir, '..', 'infra', confNames.postgres),
    join(dataDir, 'postgres.conf'),
  );
  copyFileSync(join(resourcesDir, '..', 'infra', confNames.valkey), join(dataDir, 'valkey.conf'));

  // 5. JWT_SECRET — birinchi ishga tushishda generatsiya (idempotent).
  getOrCreateJwtSecret();
};

export const runMigrations = (apiExePath: string): void => {
  const dataDir = getDataDir();
  // api.exe'ni migration rejimida ishga tushirish (`argv[2] === 'migrate'` —
  // apps/api/src/index.ts). MIGRATIONS_DIR/RLS_MIGRATIONS_DIR —
  // `bun build --compile` binary'sida `./drizzle` (CWD-relative) va
  // `import.meta.dir` ishlamaydi (apps/api/src/db/migrate.ts izohiga qarang);
  // binary yoniga bundled `drizzle/`+`migrations/rls/` papkalarga ishora
  // qilamiz (electron-builder.yml extraResources — CLI-350 kengaytmasi).
  const apiDir = dirname(apiExePath);
  const result = spawnSync(apiExePath, ['migrate'], {
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://dental:dental@localhost:5433/dental',
      DATABASE_ADMIN_URL: 'postgresql://dental:dental@localhost:5433/dental',
      DENTAL_APP_DB_PASSWORD: getOrCreateDbPassword(), // CLI-390 — dental_app roli shu parol bilan yaratiladi
      UPLOADS_DIR: join(dataDir, 'uploads'),
      MIGRATIONS_DIR: join(apiDir, 'drizzle'),
      RLS_MIGRATIONS_DIR: join(apiDir, 'migrations', 'rls'),
    },
    stdio: 'pipe',
  });
  assertSuccess(result, 'Migrations');
};
