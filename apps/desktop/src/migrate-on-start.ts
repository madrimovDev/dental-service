/**
 * P2 — har startda migratsiya + oldindan zaxira + yiqilsa tiklash.
 *
 * Ilgari migratsiya faqat first-run'da ishlardi: ilovani yangilash sxemani
 * yangilamasdi. Endi `appVersion` oxirgi muvaffaqiyatli migratsiya
 * versiyasidan farq qilsa — oldin `pg_dump`, keyin migratsiya; yiqilsa
 * dump'dan tiklanadi va chaqiruvchi API'ni ishga tushirmaydi.
 *
 * Birinchi o'rnatishda (`state === null`) baza bo'sh — dump shart emas.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getOrCreateSuperuserPassword } from './first-run.js';
import { getBackupsDir, getDataDir, getResourcesDir } from './paths.js';

export type MigrateDeps = {
  runMigrations(): void;
  dump(file: string): void;
  restore(file: string): void;
  readState(): { lastMigratedVersion: string | null };
  writeState(s: { lastMigratedVersion: string }): void;
  appVersion: string;
  now(): Date;
};

export type MigrateResult =
  | { ok: true; backedUp: string | null }
  | {
      ok: false;
      reason: 'phone_conflict' | 'failed';
      /** Baza yangilashdan oldingi holatda (tiklandi yoki umuman o'zgarmagan). */
      restored: boolean;
      message: string;
      /** Zaxira fayli (olingan bo'lsa) — tiklab bo'lmaganda foydalanuvchiga ko'rsatiladi. */
      backupFile?: string;
    };

const pad = (n: number): string => String(n).padStart(2, '0');

const stamp = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const errMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const migrateOnStart = (deps: MigrateDeps): MigrateResult => {
  const state = deps.readState();
  const needsBackup =
    state.lastMigratedVersion !== null && state.lastMigratedVersion !== deps.appVersion;

  let backupFile: string | null = null;

  if (needsBackup) {
    const file = join(getBackupsDir(), `pre-migrate-${deps.appVersion}-${stamp(deps.now())}.dump`);
    try {
      deps.dump(file);
    } catch (err) {
      // Dump yiqildi — baza hali tegilmagan, migratsiya boshlanmaydi.
      return {
        ok: false,
        reason: 'failed',
        restored: true,
        message: `Zaxira olinmadi: ${errMessage(err)}`,
      };
    }
    backupFile = file;
  }

  try {
    deps.runMigrations();
  } catch (err) {
    const message = errMessage(err);
    const reason = message.includes("Telefon normalizatsiyasi to'xtatildi")
      ? 'phone_conflict'
      : 'failed';
    let restored = false;
    if (backupFile) {
      try {
        deps.restore(backupFile);
        restored = true;
      } catch {
        restored = false;
      }
    }
    return {
      ok: false,
      reason,
      restored,
      message,
      ...(backupFile ? { backupFile } : {}),
    };
  }

  deps.writeState({ lastMigratedVersion: deps.appVersion });
  return { ok: true, backedUp: backupFile };
};

// --- Real adapterlar ---------------------------------------------------

const getStatePath = (): string => join(getDataDir(), 'state.json');

/**
 * `state.json` yo'q bo'lsa: haqiqiy birinchi o'rnatishda (`firstRun`) `null`
 * (baza bo'sh — dump shart emas); lekin bu kod versiyasidan OLDIN o'rnatilgan
 * nusxada (baza bor, state.json hali yo'q) — `unknown` sentinel: versiya
 * farqi deb hisoblanadi va dump olinadi.
 */
export const createStateStore = (
  firstRun: boolean,
): Pick<MigrateDeps, 'readState' | 'writeState'> => ({
  readState: () => {
    // Haqiqiy first-run (`postgres\data` yo'q) — baza bo'sh, dump shart emas.
    // `state.json` `postgres\data`dan TASHQARIDA yashaydi va klaster
    // yo'qolganda omon qolishi mumkin: eskirgan fayl o'qilsa mavjud bo'lmagan
    // bazadan pg_dump urinardi va ilova abadiy qulflanib qolardi.
    if (firstRun) return { lastMigratedVersion: null };
    const path = getStatePath();
    if (!existsSync(path)) return { lastMigratedVersion: 'unknown' };
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as { lastMigratedVersion?: unknown };
      return {
        lastMigratedVersion:
          typeof parsed.lastMigratedVersion === 'string' ? parsed.lastMigratedVersion : 'unknown',
      };
    } catch {
      return { lastMigratedVersion: 'unknown' };
    }
  },
  writeState: (s) => {
    mkdirSync(getDataDir(), { recursive: true });
    writeFileSync(getStatePath(), JSON.stringify(s, null, 2));
  },
});

const getPgBin = (name: 'pg_dump' | 'pg_restore' | 'psql'): string =>
  process.platform === 'win32' ? join(getResourcesDir(), 'postgres', 'bin', `${name}.exe`) : name;

export const createPgTools = (): Pick<MigrateDeps, 'dump' | 'restore'> => {
  const run = (bin: string, args: string[], label: string): void => {
    const result = spawnSync(bin, args, {
      env: { ...process.env, PGPASSWORD: getOrCreateSuperuserPassword() },
      stdio: 'pipe',
    });
    if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
    if (result.status !== 0) {
      throw new Error(`${label} failed: ${result.stderr?.toString() || 'unknown error'}`);
    }
  };
  const conn = ['-h', 'localhost', '-p', '5433', '-U', 'dental'];
  return {
    dump: (file) => {
      mkdirSync(getBackupsDir(), { recursive: true });
      run(getPgBin('pg_dump'), [...conn, '-Fc', '-f', file, 'dental'], 'pg_dump');
    },
    // `pg_restore --clean` FAQAT dump'dagi obyektlarni o'chiradi: migratsiya
    // dump'dan keyin yaratgan yangi jadval/ustunlar (drizzle migrator bitta
    // tranzaksiyada COMMIT qiladi, keyin ensureAppRole/RLS yiqilishi mumkin)
    // qolib ketardi va tuzatilgan versiya `relation already exists` bilan
    // abadiy yiqilardi. Shu sabab bazani butunlay qayta yaratamiz:
    // DROP (ulanishlarni uzib) → CREATE → bitta tranzaksiyada tiklash.
    // Rollar klaster-darajali — saqlanadi; dump egalik/grant'larni tiklaydi.
    restore: (file) => {
      run(
        getPgBin('psql'),
        [
          ...conn,
          '-d',
          'postgres',
          '-v',
          'ON_ERROR_STOP=1',
          '-c',
          'DROP DATABASE IF EXISTS dental WITH (FORCE)',
          '-c',
          'CREATE DATABASE dental',
        ],
        'recreate database',
      );
      run(
        getPgBin('pg_restore'),
        [...conn, '--exit-on-error', '--single-transaction', '-d', 'dental', file],
        'pg_restore',
      );
    },
  };
};
