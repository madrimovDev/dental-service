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
import {
  getOrCreateDbPassword,
  getOrCreateJwtSecret,
  getOrCreateSuperuserPassword,
} from './first-run.js';
import { getDataDir, getPgDataDir, getResourcesDir } from './paths.js';

// Platform param default `process.platform` — testlarda ikkala tarmoqni ham
// (win32 va boshqa) haqiqiy joriy platformadan mustaqil sinash uchun.
export const getPostgresCommand = (platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? join(getResourcesDir(), 'postgres', 'bin', 'postgres.exe') : 'postgres';

export const getValkeyCommand = (platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? join(getResourcesDir(), 'valkey', 'valkey-server.exe') : 'valkey-server';

export const getPgCtlCommand = (platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? join(getResourcesDir(), 'postgres', 'bin', 'pg_ctl.exe') : 'pg_ctl';

export const getApiCommand = (platform: NodeJS.Platform = process.platform): string =>
  join(getResourcesDir(), platform === 'win32' ? 'api.exe' : 'api');

// Bosqichlarni kutish uchun timeout'lar — testlarda tezlashtirish uchun env
// orqali override qilinadi (production'da defaultlar reja bo'yicha ishlaydi).
const getPgReadyTimeoutMs = (): number => Number(process.env.DENTAL_PG_READY_TIMEOUT_MS ?? 3000);
const getValkeyReadyDelayMs = (): number =>
  Number(process.env.DENTAL_VALKEY_READY_DELAY_MS ?? 1000);
const getApiReadyDelayMs = (): number => Number(process.env.DENTAL_API_READY_DELAY_MS ?? 2000);
const getStopWaitMs = (): number => Number(process.env.DENTAL_STOP_WAIT_MS ?? 1000);
// pg_ctl stop -m fast -w -t 10 ga ~5s zaxira bilan (P15).
const getPgCtlWaitMs = (): number => Number(process.env.DENTAL_PGCTL_WAIT_MS ?? 15000);

export type ServerStatus = 'running' | 'stopped' | 'starting';
export type ServerChild = 'postgres' | 'valkey' | 'api';

export type ServerStatusEvent = {
  status: ServerStatus;
  child?: ServerChild;
  restarts: number;
  gaveUp: boolean;
  /** DT-02: api port band bo'lgani uchun to'xtadi (restart foydasiz). */
  portBusy?: number;
};

/** DT-02: api `address already in use` bilan yiqilganda. */
export class PortInUseError extends Error {
  readonly port: number;
  constructor(port: number) {
    super(`Port ${port} boshqa dastur tomonidan band`);
    this.name = 'PortInUseError';
    this.port = port;
  }
}

// P15 — restart siyosati: kutilmagan chiqishda backoff bilan qayta ishga
// tushirish, 10 daqiqa ichida ko'pi bilan MAX_RESTARTS urinish; oshsa to'xtaydi.
export const RESTART_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000] as const;
export const MAX_RESTARTS = 5;
export const RESTART_WINDOW_MS = 10 * 60 * 1000;
// Testlarda backoff'ni qisqartirish (masalan 0.005).
const getBackoffScale = (): number => Number(process.env.DENTAL_RESTART_BACKOFF_SCALE ?? 1);
const getRestartDelayMs = (attemptIndex: number): number =>
  Math.round(
    (RESTART_BACKOFF_MS[Math.min(attemptIndex, RESTART_BACKOFF_MS.length - 1)] ?? 30000) *
      getBackoffScale(),
  );

const PORT_BUSY_RE = /EADDRINUSE|address already in use/i;

let pgProcess: ChildProcess | null = null;
let valkeyProcess: ChildProcess | null = null;
let apiProcess: ChildProcess | null = null;
let status: ServerStatus = 'stopped';
let currentApiPort = 80;

// stopServer() (yoki supervisor o'zi) qasddan o'ldirgan jarayonlar — ularning
// `exit` eventi crash emas (restart ham, soxta status o'zgarishi ham yo'q).
const intentionalKills = new WeakSet<ChildProcess>();
// `exit` bergan jarayonlar (waitForExit eventni o'tkazib yubormasligi uchun).
const exitedProcs = new WeakSet<ChildProcess>();
const portBusyProcs = new WeakSet<ChildProcess>();

let epoch = 0; // stopServer() har chaqirilganda oshadi — kechikkan restart'larni bekor qiladi
let restartTimes: number[] = [];
let gaveUp = false;
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let restartRunning = false;
const pendingRestarts = new Set<ServerChild>();
const statusListeners = new Set<(e: ServerStatusEvent) => void>();

export const onServerStatusChange = (cb: (e: ServerStatusEvent) => void): (() => void) => {
  statusListeners.add(cb);
  return () => {
    statusListeners.delete(cb);
  };
};

const emitStatus = (extra: { child?: ServerChild; portBusy?: number } = {}): void => {
  const event: ServerStatusEvent = {
    status,
    restarts: restartTimes.length,
    gaveUp,
    ...extra,
  };
  for (const cb of [...statusListeners]) {
    try {
      cb(event);
    } catch {
      // tinglovchi xatosi supervisor'ni to'xtatmasin
    }
  }
};

const logSupervision = (label: string, message: string): void => {
  try {
    appendFileSync(
      join(getDataDir(), 'logs', `${label}.log`),
      `\n[crash-supervision] ${message}\n`,
    );
  } catch {
    // diskka yozib bo'lmasa ham asosiy oqim to'xtamasin
  }
};

const resetSupervision = (): void => {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  pendingRestarts.clear();
  restartTimes = [];
  gaveUp = false;
};

const giveUp = (child: ServerChild, portBusy?: number): void => {
  gaveUp = true;
  status = 'stopped';
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  pendingRestarts.clear();
  logSupervision(
    child,
    `qayta ishga tushirish to'xtatildi (gaveUp)${portBusy ? `, port ${portBusy} band` : ''}`,
  );
  emitStatus({ child, ...(portBusy ? { portBusy } : {}) });
};

const killIntentionally = (proc: ChildProcess | null, signal: NodeJS.Signals = 'SIGTERM'): void => {
  if (!proc) return;
  intentionalKills.add(proc);
  proc.kill(signal);
};

/**
 * Bitta bola jarayonning `exit` eventini (yoki `timeoutMs` tugashini, qaysi
 * biri OLDIN kelsa) kutadi. Allaqachon chiqib bo'lgan bo'lsa darhol `true`.
 */
const waitForExit = (proc: ChildProcess | null, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    if (!proc || exitedProcs.has(proc)) {
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

const currentRef = (child: ServerChild): ChildProcess | null =>
  child === 'postgres' ? pgProcess : child === 'valkey' ? valkeyProcess : apiProcess;

/**
 * P15 (CLI-442#9 davomi) — crash-supervision: bola kutilmaganda chiqsa
 * `status='stopped'`, log'ga yoziladi va backoff bilan qayta ishga tushiriladi
 * (`scheduleRestart`). `stopServer()`/supervisor o'zi o'ldirganlar e'tiborsiz.
 */
const attachCrashSupervision = (proc: ChildProcess, label: ServerChild): void => {
  proc.on('exit', (code, signal) => {
    exitedProcs.add(proc);
    if (intentionalKills.has(proc)) return; // kutilgan
    if (currentRef(label) !== proc) return; // eskirgan jarayon
    status = 'stopped';
    logSupervision(
      label,
      `${label} kutilmaganda chiqdi (code=${code}, signal=${signal}) — status='stopped'`,
    );
    if (label === 'api' && portBusyProcs.has(proc)) {
      giveUp('api', currentApiPort);
      return;
    }
    scheduleRestart(label);
  });
};

const scheduleRestart = (label: ServerChild): void => {
  if (gaveUp) return;
  pendingRestarts.add(label);
  if (restartTimer || restartRunning) return; // mavjud sikl oladi
  kickRestart(label);
};

const kickRestart = (label: ServerChild): void => {
  const now = Date.now();
  restartTimes = restartTimes.filter((t) => now - t < RESTART_WINDOW_MS);
  if (restartTimes.length >= MAX_RESTARTS) {
    giveUp(label);
    return;
  }
  const delay = getRestartDelayMs(restartTimes.length);
  restartTimes.push(now);
  emitStatus({ child: label });
  restartTimer = setTimeout(() => {
    restartTimer = null;
    void runRestarts();
  }, delay);
  restartTimer.unref?.();
};

const runRestarts = async (): Promise<void> => {
  const myEpoch = epoch;
  restartRunning = true;
  const labels = new Set(pendingRestarts);
  pendingRestarts.clear();
  const done = new Set<ServerChild>();
  try {
    if (labels.has('postgres')) {
      // postgres yiqilsa api ulanishlari ham yaroqsiz — api qayta turadi.
      const oldApi = apiProcess;
      if (oldApi && !exitedProcs.has(oldApi)) {
        killIntentionally(oldApi);
        if (!(await waitForExit(oldApi, getStopWaitMs()))) oldApi.kill('SIGKILL');
      }
      labels.add('api');
      await spawnPostgres();
      done.add('postgres');
    }
    if (labels.has('valkey')) {
      await spawnValkey();
      done.add('valkey');
    }
    if (labels.has('api')) {
      await spawnApi(currentApiPort);
      done.add('api');
    }
    if (epoch !== myEpoch) return;
    status = 'running';
    emitStatus();
  } catch (err) {
    if (epoch !== myEpoch) return;
    if (err instanceof PortInUseError) {
      giveUp('api', err.port);
      return;
    }
    logSupervision('api', `qayta ishga tushirish xatosi: ${(err as Error).message}`);
    for (const l of labels) if (!done.has(l)) pendingRestarts.add(l);
  } finally {
    restartRunning = false;
    if (epoch !== myEpoch) {
      // restart paytida stopServer() chaqirilgan — yangi spawn bo'lganlarni yig'ishtiramiz
      for (const p of [pgProcess, valkeyProcess, apiProcess]) killIntentionally(p, 'SIGKILL');
      pgProcess = valkeyProcess = apiProcess = null;
    } else if (pendingRestarts.size > 0 && !gaveUp) {
      const first = [...pendingRestarts][0] as ServerChild;
      kickRestart(first);
    }
  }
};

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
    currentApiPort = port;
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
    const proc = apiProcess;
    proc.on('error', reject);
    attachCrashSupervision(proc, 'api');
    logChildOutput(proc, 'api.log');
    // DT-02: port band — api stdout/stderr'da `EADDRINUSE`/`address already in
    // use`. Tayyor bo'lish oynasida bo'lsa darhol PortInUseError bilan reject.
    let settled = false;
    const onOutput = (d: Buffer) => {
      if (!PORT_BUSY_RE.test(d.toString())) return;
      portBusyProcs.add(proc);
      if (!settled) {
        settled = true;
        reject(new PortInUseError(port));
      }
    };
    proc.stdout?.on('data', onOutput);
    proc.stderr?.on('data', onOutput);
    setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve();
    }, getApiReadyDelayMs()).unref?.();
  });

// Postgres+Valkey — first-run'da migratsiyalar shu ikkisi ustida ishlaydi,
// API hali kerak emas (main.ts split qilib chaqiradi: startDatabaseLayer →
// runMigrations → startApiLayer). Oddiy (non-first-run) holatda `startServer`
// hammasini ketma-ket qiladi.
export const startDatabaseLayer = async (): Promise<void> => {
  resetSupervision();
  status = 'starting';
  await spawnPostgres();
  await spawnValkey();
};

export const startApiLayer = async (port: number): Promise<void> => {
  try {
    await spawnApi(port);
  } catch (err) {
    if (err instanceof PortInUseError) status = 'stopped';
    throw err;
  }
  // Tayyor bo'lish oynasida api yiqilgan bo'lsa (supervisor restart'ni o'zi
  // boshqaradi) soxta 'running' qo'yilmaydi.
  if (apiProcess && !exitedProcs.has(apiProcess)) status = 'running';
};

export const startServer = async (port = 8080): Promise<void> => {
  await startDatabaseLayer();
  await startApiLayer(port);
};

/**
 * Postgres'ni toza to'xtatish (P15): `pg_ctl stop -m fast -w -t 10`; muvaffaqiyatsiz
 * bo'lsa (binary yo'q / non-zero / timeout) SIGTERM, keyin SIGKILL fallback.
 */
const stopPostgres = async (pg: ChildProcess): Promise<void> => {
  const pgDown = new Promise<boolean>((resolve) => {
    let ctl: ChildProcess;
    try {
      ctl = spawn(
        getPgCtlCommand(),
        ['stop', '-D', getPgDataDir(), '-m', 'fast', '-w', '-t', '10'],
        { stdio: 'pipe' },
      );
    } catch {
      resolve(false);
      return;
    }
    ctl.once('error', () => resolve(false));
    ctl.once('exit', (code) => resolve(code === 0));
    setTimeout(() => {
      if (!exitedProcs.has(ctl)) ctl.kill('SIGKILL');
      resolve(false);
    }, getPgCtlWaitMs()).unref?.();
    ctl.once('exit', () => exitedProcs.add(ctl));
  });
  const ctlOk = await pgDown;
  if (await waitForExit(pg, ctlOk ? getStopWaitMs() : 0)) return;
  pg.kill('SIGTERM');
  if (await waitForExit(pg, getStopWaitMs())) return;
  pg.kill('SIGKILL');
};

/**
 * Hamma bolalarni to'xtatadi: api/valkey — SIGTERM (kutib, keyin SIGKILL);
 * postgres — `pg_ctl stop -m fast`. Kutilayotgan restart'lar bekor qilinadi.
 */
export const stopServer = async (): Promise<void> => {
  epoch++;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  pendingRestarts.clear();
  const api = apiProcess;
  const valkey = valkeyProcess;
  const pg = pgProcess;
  for (const p of [api, valkey, pg]) if (p) intentionalKills.add(p);

  api?.kill('SIGTERM');
  valkey?.kill('SIGTERM');
  const wait = getStopWaitMs();
  const stopApiAndValkey = Promise.all([waitForExit(api, wait), waitForExit(valkey, wait)]).then(
    ([apiExited, valkeyExited]) => {
      if (!apiExited) api?.kill('SIGKILL');
      if (!valkeyExited) valkey?.kill('SIGKILL');
    },
  );
  await Promise.all([stopApiAndValkey, pg ? stopPostgres(pg) : Promise.resolve()]);

  pgProcess = valkeyProcess = apiProcess = null;
  status = 'stopped';
};

export const getServerStatus = (): ServerStatus => status;
