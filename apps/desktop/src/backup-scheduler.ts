/**
 * UI-3 / D.1 — desktop zaxira nusxa rejalashtiruvchisi (Electron main).
 *
 * - Har kuni 20:00 (oddiy `setTimeout` keyingi 20:00 gacha — `node-cron` YO'Q).
 * - `<dataDir>/backup-request.json` (API `POST /api/backup/run`) va
 *   `<dataDir>/restore-request.json` (API `POST /api/backup/restore`) 2 s polling bilan
 *   kuzatiladi — API Electron'ga faqat shu fayllar orqali topshiradi.
 * - Bir zaxira = `<papka>/dental-YYYYMMDD-HHMMSS/{db.dump, uploads.tar}`; avval
 *   `<nom>.partial` ga yoziladi, muvaffaqiyatdan keyingina nomlanadi — yarim zaxira hech qachon
 *   ro'yxatga/retention'ga kirmaydi.
 * - Retention: oxirgi 14 nusxa; eng yangisi HECH QACHON o'chmaydi.
 * - Tiklash: texnik-ish serveri → API to'xtatiladi → tiklashdan OLDIN avtomatik zaxira (retention'siz,
 *   tiklanayotgan nusxa o'chib ketmasin) → `pg_restore` (buzilgan dump bazani o'chirmaydi:
 *   `createPgTools.restore` oldin `--list`) → uploads → migratsiya → API qayta ishga tushadi.
 *
 * ⚠️ Fayl nomlari/kontrakt `apps/api/src/modules/backup/backup.schema.ts` bilan BIR XIL bo'lishi shart.
 * Qo'lda yozilgan test: `backup-scheduler.test.ts` (spy dep) + `backup-scheduler.pg.test.ts` (real PG).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const BACKUP_NAME_RE = /^dental-\d{8}-\d{6}$/;
export const BACKUP_DB_FILE = 'db.dump';
export const BACKUP_UPLOADS_FILE = 'uploads.tar';
export const BACKUP_SETTINGS_FILE = 'backup-settings.json';
export const BACKUP_STATE_FILE = 'backup-state.json';
export const BACKUP_REQUEST_FILE = 'backup-request.json';
export const RESTORE_REQUEST_FILE = 'restore-request.json';
export const RESTORE_RESULT_FILE = 'restore-result.json';

export const BACKUP_RETENTION = 14;
export const BACKUP_HOUR = 20;
export const POLL_INTERVAL_MS = 2000;

const pad = (n: number): string => String(n).padStart(2, '0');

export const backupStamp = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** Keyingi kunlik zaxira vaqti (mahalliy soat): bugun 20:00 o'tmagan bo'lsa bugun, aks holda ertaga. */
export const nextBackupTime = (now: Date, hour = BACKUP_HOUR): Date => {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
};

/** Default papka: Windows `D:\DentalBackup` (D: yo'q bo'lsa `C:\DentalBackup`), Linux dev `<dataDir>/backups`. */
export const resolveDefaultBackupFolder = (opts: {
  platform: NodeJS.Platform;
  dataDir: string;
  driveExists: (root: string) => boolean;
}): string => {
  if (opts.platform === 'win32') {
    return opts.driveExists('D:\\') ? 'D:\\DentalBackup' : 'C:\\DentalBackup';
  }
  return join(opts.dataDir, 'backups');
};

export type TimerApi = {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
};

export type BackupSchedulerDeps = {
  now(): Date;
  timers: TimerApi;
  getDataDir(): string;
  defaultFolder(): string;
  /** `pg_dump -Fc` -> fayl. */
  dump(file: string): void;
  /** `pg_restore` (bazani qayta yaratadi; avval `--list` bilan tekshiradi). */
  restoreDb(file: string): void;
  /** uploads papkasini arxivlaydi; papka yo'q bo'lsa `false` (arxiv yozilmaydi). */
  archiveUploads(dest: string): boolean;
  extractUploads(src: string): void;
  /** Tiklangan (eski sxemali bo'lishi mumkin) bazani joriy sxemaga ko'taradi. */
  migrate(): void;
  stopApi(): Promise<void>;
  startApi(): Promise<void>;
  maintenance: { start(): Promise<void>; stop(): Promise<void> };
  log(message: string): void;
};

export type BackupOutcome = { ok: true; name: string } | { ok: false; error: string };

export type BackupKind = 'scheduled' | 'manual' | 'pre-restore';

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const readJson = (path: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

export const createBackupScheduler = (deps: BackupSchedulerDeps) => {
  const dataPath = (name: string): string => join(deps.getDataDir(), name);

  const getFolder = (): string => {
    const saved = readJson(dataPath(BACKUP_SETTINGS_FILE)).folder;
    return typeof saved === 'string' && saved.trim() !== '' ? saved : deps.defaultFolder();
  };

  const writeState = (patch: { lastSuccessAt?: string; lastError: string | null }): void => {
    const prev = readJson(dataPath(BACKUP_STATE_FILE));
    mkdirSync(deps.getDataDir(), { recursive: true });
    writeFileSync(dataPath(BACKUP_STATE_FILE), JSON.stringify({ ...prev, ...patch }, null, 2));
  };

  /** Haqiqiy (tugallangan) nusxalar — yangidan eskiga. `.partial` va begona nomlar hisobga olinmaydi. */
  const listBackups = (folder: string): string[] => {
    if (!existsSync(folder)) return [];
    return readdirSync(folder, { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() &&
          BACKUP_NAME_RE.test(e.name) &&
          existsSync(join(folder, e.name, BACKUP_DB_FILE)),
      )
      .map((e) => e.name)
      .sort()
      .reverse();
  };

  /** Eng yangi `BACKUP_RETENTION` ta saqlanadi; eng yangisi hech qachon o'chmaydi. */
  const applyRetention = (folder: string): void => {
    const names = listBackups(folder);
    for (const stale of names.slice(Math.max(1, BACKUP_RETENTION))) {
      rmSync(join(folder, stale), { recursive: true, force: true });
    }
  };

  let busy = false;

  const runBackupUnlocked = (kind: BackupKind): BackupOutcome => {
    const folder = getFolder();
    const name = `dental-${backupStamp(deps.now())}`;
    const partial = join(folder, `${name}.partial`);
    try {
      mkdirSync(folder, { recursive: true });
      // Oldingi yiqilgan urinishlardan qolgan yarim papkalar.
      for (const e of readdirSync(folder, { withFileTypes: true })) {
        if (e.isDirectory() && e.name.endsWith('.partial')) {
          rmSync(join(folder, e.name), { recursive: true, force: true });
        }
      }
      if (existsSync(join(folder, name))) {
        // Shu soniyada allaqachon nusxa bor — yangisi shuning o'zi.
        return { ok: true, name };
      }
      mkdirSync(partial, { recursive: true });
      deps.dump(join(partial, BACKUP_DB_FILE));
      if (!existsSync(join(partial, BACKUP_DB_FILE))) throw new Error('pg_dump fayl yaratmadi');
      deps.archiveUploads(join(partial, BACKUP_UPLOADS_FILE));
      renameSync(partial, join(folder, name));
      // Tiklashdan oldingi zaxirada retention YO'Q: tiklanayotgan eng eski nusxa o'chib ketmasin.
      if (kind !== 'pre-restore') applyRetention(folder);
      writeState({ lastSuccessAt: deps.now().toISOString(), lastError: null });
      deps.log(`zaxira olindi (${kind}): ${name}`);
      return { ok: true, name };
    } catch (err) {
      rmSync(partial, { recursive: true, force: true });
      const error = errMessage(err);
      writeState({ lastError: error });
      deps.log(`zaxira muvaffaqiyatsiz (${kind}): ${error}`);
      return { ok: false, error };
    }
  };

  const runBackup = async (kind: BackupKind): Promise<BackupOutcome> => {
    if (busy) return { ok: false, error: 'busy' };
    busy = true;
    try {
      return runBackupUnlocked(kind);
    } finally {
      busy = false;
    }
  };

  const writeRestoreResult = (result: Record<string, unknown>): void => {
    mkdirSync(deps.getDataDir(), { recursive: true });
    writeFileSync(
      dataPath(RESTORE_RESULT_FILE),
      JSON.stringify({ ...result, finishedAt: deps.now().toISOString() }, null, 2),
    );
  };

  const performRestore = async (file: unknown): Promise<{ ok: boolean; error?: string }> => {
    const folder = getFolder();
    // Ikkinchi himoya (API allaqachon tekshirgan): faqat zaxira nomi, papka ichida.
    if (typeof file !== 'string' || !BACKUP_NAME_RE.test(file)) {
      return { ok: false, error: 'invalid file name' };
    }
    const dir = join(folder, file);
    const dbFile = join(dir, BACKUP_DB_FILE);
    const uploadsFile = join(dir, BACKUP_UPLOADS_FILE);
    if (!existsSync(dbFile)) return { ok: false, error: 'backup not found' };

    await deps.maintenance.start();
    let apiStopped = false;
    let preRestore: string | null = null;
    let stage = 'api_stop';
    try {
      await deps.stopApi();
      apiStopped = true;
      stage = 'pre_restore_backup';
      const pre = runBackupUnlocked('pre-restore');
      if (!pre.ok) throw new Error(`tiklashdan oldingi zaxira olinmadi: ${pre.error}`);
      preRestore = pre.name;

      stage = 'restore_db';
      try {
        deps.restoreDb(dbFile);
      } catch (err) {
        // `--list` tekshiruvi yiqilgan bo'lsa baza TEGILMAGAN. Boshqa xato bazani qayta yaratgandan
        // keyin bo'lishi mumkin — tiklashdan oldingi nusxaga qaytamiz.
        if (!errMessage(err).startsWith('pg_restore --list failed')) {
          try {
            deps.restoreDb(join(folder, preRestore, BACKUP_DB_FILE));
          } catch (rollbackErr) {
            deps.log(`pre-restore'ga qaytarib bo'lmadi: ${errMessage(rollbackErr)}`);
          }
        }
        throw err;
      }
      if (existsSync(uploadsFile)) {
        stage = 'restore_uploads';
        deps.extractUploads(uploadsFile);
      }
      stage = 'migrate';
      deps.migrate();
      return { ok: true };
    } catch (err) {
      const error = `${stage}: ${errMessage(err)}`;
      writeState({ lastError: `tiklash muvaffaqiyatsiz (${error})` });
      return { ok: false, error };
    } finally {
      // Texnik-ish serveri portni bo'shatadi, keyin API qaytadi (API to'xtagan bo'lsa).
      try {
        await deps.maintenance.stop();
      } catch (err) {
        deps.log(`maintenance stop: ${errMessage(err)}`);
      }
      if (apiStopped) {
        try {
          await deps.startApi();
        } catch (err) {
          deps.log(`API qayta ishga tushmadi: ${errMessage(err)}`);
        }
      }
      deps.log(`tiklash tugadi: ${file} (pre-restore: ${preRestore ?? '-'})`);
    }
  };

  const handleRestoreRequest = async (): Promise<void> => {
    const path = dataPath(RESTORE_REQUEST_FILE);
    const request = readJson(path);
    // So'rov DARHOL o'chiriladi — kutilmagan to'xtashdan keyin qayta-qayta tiklash sikli bo'lmasin.
    rmSync(path, { force: true });
    const file = request.file;
    writeRestoreResult({ status: 'running', file });
    const r = await performRestore(file);
    writeRestoreResult({
      status: r.ok ? 'ok' : 'failed',
      file,
      ...(r.error ? { error: r.error } : {}),
    });
    if (r.ok) writeState({ lastError: null });
  };

  let polling = false;
  const poll = async (): Promise<void> => {
    if (busy || polling) return;
    polling = true;
    try {
      if (existsSync(dataPath(RESTORE_REQUEST_FILE))) {
        busy = true;
        try {
          await handleRestoreRequest();
        } finally {
          busy = false;
        }
      } else if (existsSync(dataPath(BACKUP_REQUEST_FILE))) {
        rmSync(dataPath(BACKUP_REQUEST_FILE), { force: true });
        await runBackup('manual');
      }
    } catch (err) {
      deps.log(`poll xatosi: ${errMessage(err)}`);
    } finally {
      polling = false;
    }
  };

  let dailyTimer: unknown = null;
  let pollTimer: unknown = null;
  let stopped = true;

  const armDaily = (): void => {
    if (stopped) return;
    const now = deps.now();
    const delay = nextBackupTime(now).getTime() - now.getTime();
    dailyTimer = deps.timers.setTimeout(() => {
      void (async () => {
        await runBackup('scheduled');
        armDaily();
      })();
    }, delay);
  };

  const start = (): void => {
    if (!stopped) return;
    stopped = false;
    armDaily();
    pollTimer = deps.timers.setInterval(() => void poll(), POLL_INTERVAL_MS);
  };

  const stop = (): void => {
    stopped = true;
    if (dailyTimer !== null) deps.timers.clearTimeout(dailyTimer);
    if (pollTimer !== null) deps.timers.clearInterval(pollTimer);
    dailyTimer = pollTimer = null;
  };

  return { start, stop, poll, runBackup, listBackups, getFolder };
};

export type BackupScheduler = ReturnType<typeof createBackupScheduler>;
