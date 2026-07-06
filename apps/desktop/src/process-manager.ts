/**
 * Electron process manager — Server rejimida portable PostgreSQL + Valkey +
 * `api.exe` ni ishga tushiradi/to'xtatadi (CLI-346, Task 7).
 *
 * `config.ts` konvensiyasiga mos: yo'llar/timeout'lar chaqiruv-vaqtida
 * funksiyalar orqali hisoblanadi (env-override bilan testable bo'lishi
 * uchun) — modul import vaqtida "muzlatilgan" konstantaga tayanmaydi.
 *
 * Postgres/Valkey binary: Windows'da portable (`resources/postgres/bin/*.exe`
 * + `resources/valkey/*.exe`, NSIS bilan bundled — CLI-350). Boshqa
 * platformalarda (Linux/macOS) BUNDLED binary yo'q (production faqat
 * Windows'ga mo'ljallangan) — tizimga o'rnatilgan `postgres`/`valkey-server`ni
 * PATH orqali ishlatamiz. `api` binary esa ikkala platformada ham
 * `resources/`ga bundled (`bun build --compile` platform-mos chiqaradi).
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import {
  getOrCreateDbPassword,
  getOrCreateJwtSecret,
  getOrCreateSuperuserPassword,
} from './first-run.js';

const getResourcesDir = (): string =>
  app.isPackaged ? process.resourcesPath : join(import.meta.dirname, '..', 'resources');

// Postgres/Valkey/uploads/logs bir xil ma'lumot papkasi ostida yashaydi
// (`config.ts`dagi CONFIG_DIR bilan bir xil default — DENTAL_DATA_DIR alohida
// override qilinishi mumkin, masalan testlarda).
const getDataDir = (): string =>
  process.env.DENTAL_DATA_DIR ||
  (process.platform === 'win32' ? 'C:\\ProgramData\\DentalService' : '/var/lib/dental-service');

const getPgDataDir = (): string => join(getDataDir(), 'postgres', 'data');

// Platform param default `process.platform` — testlarda ikkala tarmoqni ham
// (win32 va boshqa) haqiqiy joriy platformadan mustaqil sinash uchun.
export const getPostgresCommand = (platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? join(getResourcesDir(), 'postgres', 'bin', 'postgres.exe') : 'postgres';

export const getValkeyCommand = (platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? join(getResourcesDir(), 'valkey', 'valkey-server.exe') : 'valkey-server';

export const getApiCommand = (platform: NodeJS.Platform = process.platform): string =>
  join(getResourcesDir(), platform === 'win32' ? 'api.exe' : 'api');

// Bosqichlarni kutish uchun timeout'lar — testlarda tezlashtirish uchun env
// orqali override qilinadi (production'da defaultlar reja bo'yicha ishlaydi).
const getPgReadyTimeoutMs = (): number => Number(process.env.DENTAL_PG_READY_TIMEOUT_MS ?? 3000);
const getValkeyReadyDelayMs = (): number =>
  Number(process.env.DENTAL_VALKEY_READY_DELAY_MS ?? 1000);
const getApiReadyDelayMs = (): number => Number(process.env.DENTAL_API_READY_DELAY_MS ?? 2000);
const getStopWaitMs = (): number => Number(process.env.DENTAL_STOP_WAIT_MS ?? 1000);

export type ServerStatus = 'running' | 'stopped' | 'starting';

let pgProcess: ChildProcess | null = null;
let valkeyProcess: ChildProcess | null = null;
let apiProcess: ChildProcess | null = null;
let status: ServerStatus = 'stopped';

const waitMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms).unref?.());

// Har spawn qilingan child process stdout/stderr'ini `<dataDir>/logs/<name>`ga
// yozadi — avval hech qayerga yozilmasdi (main.ts xato dialogida "Loglarni
// ko'ring: ${LOGS_DIR}" deb ko'rsatsa ham, u yerda hech narsa yo'q edi;
// 2026-07-02 real-run debug'da topildi). `stdio: 'pipe'` bilan birga ishlaydi
// — postgres tayyor-signalini ushlash o'zgarmaydi, faqat qo'shimcha listener.
const logChildOutput = (proc: ChildProcess, filename: string): void => {
  const logPath = join(getDataDir(), 'logs', filename);
  try {
    mkdirSync(join(getDataDir(), 'logs'), { recursive: true });
  } catch {
    // logs papkasi yaratilmasa ham asosiy oqim to'xtamasin
  }
  const append = (d: Buffer) => {
    try {
      appendFileSync(logPath, d);
    } catch {
      // diskka yozib bo'lmasa ham asosiy oqim to'xtamasin
    }
  };
  proc.stdout?.on('data', append);
  proc.stderr?.on('data', append);
};

const spawnPostgres = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const dataDir = getDataDir();
    pgProcess = spawn(
      getPostgresCommand(),
      ['-D', getPgDataDir(), '-p', '5433', '-c', `config_file=${join(dataDir, 'postgres.conf')}`],
      { stdio: 'pipe' },
    );
    pgProcess.on('error', reject);
    logChildOutput(pgProcess, 'postgres.log');
    // Postgres tayyor bo'lguncha kutamiz (log'da "ready to accept connections")
    pgProcess.stdout?.on('data', (d: Buffer) => {
      if (d.toString().includes('ready to accept connections')) resolve();
    });
    pgProcess.stderr?.on('data', (d: Buffer) => {
      if (d.toString().includes('ready to accept connections')) resolve();
    });
    setTimeout(() => resolve(), getPgReadyTimeoutMs()).unref?.(); // fallback — log formatini kafolatlamaymiz
  });

const spawnValkey = (): Promise<void> =>
  new Promise((resolve, reject) => {
    valkeyProcess = spawn(getValkeyCommand(), [join(getDataDir(), 'valkey.conf')], {
      stdio: 'pipe',
    });
    // Binary topilmadi/spawn muvaffaqiyatsiz — reject (postgres bilan bir xil
    // pattern), aks holda 'error' hech kim tinglamasa unhandled exception
    // Electron main process'ni crash qiladi (CLI-346 qarori: binary
    // topilmadi -> Error throw -> main.ts dialog.showErrorBox()).
    valkeyProcess.on('error', reject);
    logChildOutput(valkeyProcess, 'valkey.log');
    setTimeout(() => resolve(), getValkeyReadyDelayMs()).unref?.();
  });

const spawnApi = (port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const dataDir = getDataDir();
    apiProcess = spawn(getApiCommand(), [], {
      env: {
        ...process.env,
        API_PORT: String(port),
        // ⚠️ `dental_app` (NOSUPERUSER/NOBYPASSRLS) — HECH QACHON `dental`
        // (superuser) EMAS. Superuser Postgres RLS'ni avtomatik chetlab
        // o'tadi — runtime shu orqali ulansa, butun tenant izolyatsiyasi
        // (CLAUDE.md §3.4) yo'qqa chiqadi (2026-07-02 topilgan xavfsizlik
        // bugi). `dental_app` roli `db/migrate.ts`ning `ensureAppRole()`si
        // orqali first-run'da yaratiladi (`runMigrations()` shundan keyin).
        DATABASE_URL: `postgresql://dental_app:${getOrCreateDbPassword()}@localhost:5433/dental`,
        // Recall worker (in-process, RUN_REMINDER_WORKER=true) qasddan
        // superuser orqali cross-tenant scan qiladi (lib/db/client.ts
        // `createAdminDb()` buni talab qiladi — DATABASE_URL'ga fallback
        // qilmaydi, chunki RLS uni 0 qatorga cheklab qo'yardi). Bu — yagona
        // qasddan RLS-bypass, boshqa hech bir so'rov buni ishlatmaydi.
        // CLI-442#8 — superuser `dental` endi scram-sha-256 bilan
        // himoyalangan (trust emas, first-run.ts `getOrCreateSuperuserPassword`),
        // shu sabab hardcoded `dental:dental` o'rniga persisted parol.
        DATABASE_ADMIN_URL: `postgresql://dental:${getOrCreateSuperuserPassword()}@localhost:5433/dental`,
        REDIS_URL: 'redis://localhost:6380',
        UPLOADS_DIR: join(dataDir, 'uploads'),
        // JWT_SECRET/WEB_ORIGIN — env-schema.ts talab qiladi, lekin
        // foydalanuvchi shell'ida hech qachon bo'lmaydi (real Windows PC'da
        // dev env yo'q) — desktop o'zi ta'minlashi shart (CLI-346/CLI-348
        // gap, 2026-07-02 topildi va tuzatildi).
        JWT_SECRET: getOrCreateJwtSecret(),
        WEB_ORIGIN: `http://localhost:${port}`,
        // Bitta-EXE arxitektura — apps/web build outputni ham shu api
        // process serve qiladi (apps/api/src/app.ts WEB_DIST_DIR bo'lsa
        // serveStatic+SPA fallback qo'shadi).
        WEB_DIST_DIR: join(getResourcesDir(), 'web'),
        // CLI-433 — atayin desktop-gate signal (litsenziya module-gating
        // faqat shu env `=== 'true'` bo'lganda faollashadi; `WEB_DIST_DIR`
        // litsenziyaga aloqasi bo'lmagan static-serve sozlamasi edi, gate
        // signali sifatida noto'g'ri edi — license-middleware.ts izohiga qarang).
        DENTAL_LOCAL_DESKTOP: 'true',
        RUN_REMINDER_WORKER: 'true',
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
    });
    // postgres/valkey bilan bir xil pattern — binary topilmasa reject.
    apiProcess.on('error', reject);
    logChildOutput(apiProcess, 'api.log');
    setTimeout(() => resolve(), getApiReadyDelayMs()).unref?.();
  });

// Postgres+Valkey — first-run'da migratsiyalar shu ikkisi ustida ishlaydi,
// API hali kerak emas (main.ts split qilib chaqiradi: startDatabaseLayer →
// runMigrations → startApiLayer). Oddiy (non-first-run) holatda `startServer`
// hammasini ketma-ket qiladi.
export const startDatabaseLayer = async (): Promise<void> => {
  status = 'starting';
  await spawnPostgres();
  await spawnValkey();
};

export const startApiLayer = async (port: number): Promise<void> => {
  await spawnApi(port);
  status = 'running';
};

export const startServer = async (port = 80): Promise<void> => {
  await startDatabaseLayer();
  await startApiLayer(port);
};

export const stopServer = async (): Promise<void> => {
  apiProcess?.kill('SIGTERM');
  valkeyProcess?.kill('SIGTERM');
  pgProcess?.kill('SIGTERM');
  await waitMs(getStopWaitMs());
  status = 'stopped';
};

export const getServerStatus = (): ServerStatus => status;
