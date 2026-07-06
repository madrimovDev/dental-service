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

// CLI-442#9 — `stopServer()` bilan qasddan to'xtatilayotgan payt bilan
// kutilmagan crash'ni ajratish uchun bayroq. Qasddan to'xtatishda `exit`
// eventi kutilgan (SIGTERM/SIGKILL natijasi) — status'ni yana o'zgartirish
// shart emas (`stopServer` allaqachon 'stopped' qo'yadi). Kutilmagan chiqishda
// (`stoppingIntentionally === false`) — soxta "running" holatini oldini olish
// uchun status darhol 'stopped'ga o'tkaziladi.
let stoppingIntentionally = false;

/**
 * CLI-442#9 — crash-supervision: ilgari spawn qilingan bola jarayonlarga
 * `exit`/`error` tinglovchisi umuman ulanmagan edi. Bola kutilmaganda
 * crash bo'lsa (masalan Postgres OOM'dan o'lsa) `status` "running" bo'lib
 * qolar edi — soxta "hammasi yaxshi" holati. Endi har bir bola crash
 * bo'lganda (`stoppingIntentionally` yolg'on bo'lsa) darhol `status='stopped'`
 * qo'yiladi va log fayliga yoziladi. Avtomatik qayta ishga tushirish (restart)
 * QILINMAYDI — spec ruxsat bergan ikkita variantdan ("status='stopped' YOKI
 * cheklangan restart") soddaroq va xavfsizrog'i tanlandi (restart-loop xavfi
 * yo'q); foydalanuvchi tray orqali qayta ishga tushirishi mumkin.
 */
const attachCrashSupervision = (proc: ChildProcess, label: string): void => {
  proc.on('exit', (code, signal) => {
    if (stoppingIntentionally) return; // kutilgan — stopServer() allaqachon 'stopped' qo'yadi
    status = 'stopped';
    const logPath = join(getDataDir(), 'logs', `${label}.log`);
    try {
      appendFileSync(
        logPath,
        `\n[crash-supervision] ${label} kutilmaganda chiqdi (code=${code}, signal=${signal}) — status='stopped'\n`,
      );
    } catch {
      // diskka yozib bo'lmasa ham asosiy oqim to'xtamasin
    }
  });
};

/**
 * CLI-442#9 — bitta bola jarayonning `exit` eventini (yoki `timeoutMs`
 * tugashini, qaysi biri OLDIN kelsa) kutadi. `stopServer`ning SIGTERM→SIGKILL
 * eskalatsiyasi uchun: agar bola `timeoutMs` ichida chiqib ketmasa (Postgres
 * "Smart Shutdown" sekin javob berishi mumkin), chaqiruvchi `SIGKILL`
 * yuboradi — aks holda jarayon orphan qolib, keyingi startda port band/
 * data-dir lock xatosi berardi (`getStopWaitMs()` default 1000ms qat'iy
 * kutish o'rniga — endi haqiqiy tugashni kutadi, keyin escalate qiladi).
 */
const waitForExit = (proc: ChildProcess | null, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    if (!proc) {
      resolve(true);
      return;
    }
    let settled = false;
    const onExit = () => {
      if (settled) return;
      settled = true;
      resolve(true);
    };
    proc.once('exit', onExit);
    setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.off('exit', onExit);
      resolve(false);
    }, timeoutMs).unref?.();
  });

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
    attachCrashSupervision(pgProcess, 'postgres');
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
    attachCrashSupervision(valkeyProcess, 'valkey');
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
    attachCrashSupervision(apiProcess, 'api');
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

/**
 * CLI-442#9 — ilgari faqat `SIGTERM` yuborib qat'iy `getStopWaitMs()`
 * (default 1000ms) kutar edi, jarayon haqiqatda tugaganini tekshirmasdan.
 * Postgres SIGTERM'ga (Smart Shutdown) sekin javob berishi mumkin — 1s ichida
 * tugamasa jarayon ORPHAN bo'lib qolardi (keyingi startda port band/data-dir
 * lock xatosi). Endi har bola `exit` eventini kutadi (`waitForExit`,
 * `timeoutMs` ichida chiqmasa `false`); hali tirik bo'lganlarga `SIGKILL`
 * yuboriladi (escalation).
 */
export const stopServer = async (): Promise<void> => {
  stoppingIntentionally = true;
  try {
    apiProcess?.kill('SIGTERM');
    valkeyProcess?.kill('SIGTERM');
    pgProcess?.kill('SIGTERM');

    const waitMsValue = getStopWaitMs();
    const [apiExited, valkeyExited, pgExited] = await Promise.all([
      waitForExit(apiProcess, waitMsValue),
      waitForExit(valkeyProcess, waitMsValue),
      waitForExit(pgProcess, waitMsValue),
    ]);

    if (!apiExited) apiProcess?.kill('SIGKILL');
    if (!valkeyExited) valkeyProcess?.kill('SIGKILL');
    if (!pgExited) pgProcess?.kill('SIGKILL');

    status = 'stopped';
  } finally {
    stoppingIntentionally = false;
  }
};

export const getServerStatus = (): ServerStatus => status;
