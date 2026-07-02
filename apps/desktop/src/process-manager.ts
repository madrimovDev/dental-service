/**
 * Electron process manager — Server rejimida portable PostgreSQL + Valkey +
 * `api.exe` ni ishga tushiradi/to'xtatadi (CLI-346, Task 7).
 *
 * `config.ts` konvensiyasiga mos: yo'llar/timeout'lar chaqiruv-vaqtida
 * funksiyalar orqali hisoblanadi (env-override bilan testable bo'lishi
 * uchun) — modul import vaqtida "muzlatilgan" konstantaga tayanmaydi.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';
import { app } from 'electron';

const getResourcesDir = (): string =>
  app.isPackaged ? process.resourcesPath : join(import.meta.dirname, '../../resources');

// Postgres/Valkey/uploads/logs bir xil ma'lumot papkasi ostida yashaydi
// (`config.ts`dagi CONFIG_DIR bilan bir xil default — DENTAL_DATA_DIR alohida
// override qilinishi mumkin, masalan testlarda).
const getDataDir = (): string =>
  process.env.DENTAL_DATA_DIR ||
  (process.platform === 'win32' ? 'C:\\ProgramData\\DentalService' : '/var/lib/dental-service');

const getPgDataDir = (): string => join(getDataDir(), 'postgres', 'data');

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

const spawnPostgres = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const dataDir = getDataDir();
    const pgBin = join(getResourcesDir(), 'postgres', 'bin');
    pgProcess = spawn(
      join(pgBin, 'postgres.exe'),
      ['-D', getPgDataDir(), '-p', '5433', '-c', `config_file=${join(dataDir, 'postgres.conf')}`],
      { stdio: 'pipe' },
    );
    pgProcess.on('error', reject);
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
    const valkeyBin = join(getResourcesDir(), 'valkey');
    valkeyProcess = spawn(
      join(valkeyBin, 'valkey-server.exe'),
      [join(getDataDir(), 'valkey.conf')],
      { stdio: 'pipe' },
    );
    // Binary topilmadi/spawn muvaffaqiyatsiz — reject (postgres bilan bir xil
    // pattern), aks holda 'error' hech kim tinglamasa unhandled exception
    // Electron main process'ni crash qiladi (CLI-346 qarori: binary
    // topilmadi -> Error throw -> main.ts dialog.showErrorBox()).
    valkeyProcess.on('error', reject);
    setTimeout(() => resolve(), getValkeyReadyDelayMs()).unref?.();
  });

const spawnApi = (port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const apiBin = join(getResourcesDir(), 'api.exe');
    apiProcess = spawn(apiBin, [], {
      env: {
        ...process.env,
        API_PORT: String(port),
        DATABASE_URL: 'postgresql://dental:dental@localhost:5433/dental',
        REDIS_URL: 'redis://localhost:6380',
        UPLOADS_DIR: join(getDataDir(), 'uploads'),
        RUN_REMINDER_WORKER: 'true',
        NODE_ENV: 'production',
      },
      stdio: 'pipe',
    });
    // postgres/valkey bilan bir xil pattern — binary topilmasa reject.
    apiProcess.on('error', reject);
    setTimeout(() => resolve(), getApiReadyDelayMs()).unref?.();
  });

export const startServer = async (port = 80): Promise<void> => {
  status = 'starting';
  await spawnPostgres();
  await spawnValkey();
  await spawnApi(port);
  status = 'running';
};

export const stopServer = async (): Promise<void> => {
  apiProcess?.kill('SIGTERM');
  valkeyProcess?.kill('SIGTERM');
  pgProcess?.kill('SIGTERM');
  await waitMs(getStopWaitMs());
  status = 'stopped';
};

export const getServerStatus = (): ServerStatus => status;
