/**
 * UI-3 / D.1 — zaxira + tiklash REAL adapterlar bilan: real Postgres (`pg_dump -Fc` / `pg_restore`),
 * real `tar`, real fayl-tizimi. Faqat API stop/start, migratsiya va texnik-ish serveri spy.
 *
 * Faqat `P2_PG_TEST=1` bo'lsa (migrate-on-start.pg.test.ts bilan bir xil env: `P2_PG_HOST`,
 * `P2_PG_PORT`, `P2_PG_USER`, `P2_PG_PASSWORD`, `P2_PG_BIN_DIR` — server versiyasiga mos asboblar).
 * Scratch baza `ui3_backup_scratch` — ilova bazasiga HECH QACHON tegilmaydi.
 *
 *   cd apps/desktop && P2_PG_TEST=1 P2_PG_PASSWORD=… [P2_PG_BIN_DIR=…] bun test src/backup-scheduler.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'bk-pg-data-'));
process.env.DENTAL_DATA_DIR ??= dataDir;
await import('./test-electron-mock.js');
const { createPgTools } = await import('./migrate-on-start.js');
const { createBackupScheduler } = await import('./backup-scheduler.js');
const { createUploadsTools } = await import('./backup-tools.js');

const enabled = process.env.P2_PG_TEST === '1';
const host = process.env.P2_PG_HOST ?? 'localhost';
const port = process.env.P2_PG_PORT ?? '5433';
const user = process.env.P2_PG_USER ?? 'dental';
const password = process.env.P2_PG_PASSWORD ?? '';
const DB = 'ui3_backup_scratch';
const binDir = process.env.P2_PG_BIN_DIR;
const pgBin = (n: string): string => (binDir ? join(binDir, n) : n);

const psql = (database: string, sql: string): string => {
  const r = spawnSync(
    pgBin('psql'),
    ['-h', host, '-p', port, '-U', user, '-d', database, '-tA', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { env: { ...process.env, PGPASSWORD: password }, stdio: 'pipe' },
  );
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
};

describe.skipIf(!enabled)('zaxira + tiklash — real Postgres + tar', () => {
  const folder = join(dataDir, 'zaxira');
  const uploads = join(dataDir, 'uploads');
  const calls: string[] = [];
  let clock = new Date(2026, 10, 11, 20, 0, 0);

  const tools = createPgTools({
    host,
    port,
    user,
    database: DB,
    password: () => password,
    bin: pgBin,
  });
  const up = createUploadsTools(() => uploads);
  const scheduler = createBackupScheduler({
    now: () => clock,
    timers: {
      setTimeout: () => 0,
      clearTimeout: () => {},
      setInterval: () => 0,
      clearInterval: () => {},
    },
    getDataDir: () => dataDir,
    defaultFolder: () => folder,
    dump: tools.dump,
    restoreDb: tools.restore,
    archiveUploads: up.archiveUploads,
    extractUploads: up.extractUploads,
    migrate: () => calls.push('migrate'),
    stopApi: async () => {
      calls.push('stopApi');
    },
    startApi: async () => {
      calls.push('startApi');
    },
    maintenance: {
      start: async () => {
        calls.push('maint:start');
      },
      stop: async () => {
        calls.push('maint:stop');
      },
    },
    log: () => {},
  });

  beforeAll(() => {
    psql('postgres', `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    psql('postgres', `CREATE DATABASE ${DB}`);
    psql(DB, 'CREATE TABLE patients (id int primary key, name text)');
    psql(DB, "INSERT INTO patients VALUES (1, 'Ali')");
    mkdirSync(uploads, { recursive: true });
    writeFileSync(join(uploads, 'rasm.txt'), 'asl-rasm');
    writeFileSync(join(dataDir, 'backup-settings.json'), JSON.stringify({ folder }));
  });

  afterAll(() => {
    psql('postgres', `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('zaxira olish -> buzish -> UI so‘rovi bilan tiklash: baza va uploads qaytadi', async () => {
    const r = await scheduler.runBackup('manual');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(existsSync(join(folder, r.name, 'db.dump'))).toBe(true);
    expect(existsSync(join(folder, r.name, 'uploads.tar'))).toBe(true);

    // Buzamiz: ma'lumot o'zgaradi, yangi jadval, uploads almashadi.
    psql(DB, "UPDATE patients SET name = 'Buzilgan'");
    psql(DB, 'CREATE TABLE ortiqcha (id int)');
    writeFileSync(join(uploads, 'rasm.txt'), 'buzilgan-rasm');
    writeFileSync(join(uploads, 'yangi.txt'), 'yangi');

    clock = new Date(2026, 10, 12, 9, 0, 0);
    writeFileSync(join(dataDir, 'restore-request.json'), JSON.stringify({ file: r.name }));
    await scheduler.poll();

    expect(psql(DB, 'select name from patients where id = 1')).toBe('Ali');
    expect(
      psql(DB, "select count(*) from information_schema.tables where table_name = 'ortiqcha'"),
    ).toBe('0');
    expect(readFileSync(join(uploads, 'rasm.txt'), 'utf8')).toBe('asl-rasm');
    expect(existsSync(join(uploads, 'yangi.txt'))).toBe(false);
    expect(existsSync(`${uploads}.old`)).toBe(false);
    expect(calls).toEqual(['maint:start', 'stopApi', 'migrate', 'maint:stop', 'startApi']);

    const result = JSON.parse(readFileSync(join(dataDir, 'restore-result.json'), 'utf8'));
    expect(result.status).toBe('ok');
    // Tiklashdan oldingi avtomatik nusxa mavjud (buzilgan holat saqlangan).
    expect(scheduler.listBackups(folder).length).toBe(2);
  });

  test('buzilgan dump: baza o‘chirilmaydi, API qaytadi, xato yoziladi', async () => {
    const bad = 'dental-20261001-200000';
    mkdirSync(join(folder, bad), { recursive: true });
    writeFileSync(join(folder, bad, 'db.dump'), 'bu pg dump emas');
    calls.length = 0;
    clock = new Date(2026, 10, 13, 9, 0, 0);
    writeFileSync(join(dataDir, 'restore-request.json'), JSON.stringify({ file: bad }));
    await scheduler.poll();

    expect(psql(DB, 'select name from patients where id = 1')).toBe('Ali');
    expect(calls).toEqual(['maint:start', 'stopApi', 'maint:stop', 'startApi']);
    const result = JSON.parse(readFileSync(join(dataDir, 'restore-result.json'), 'utf8'));
    expect(result.status).toBe('failed');
    expect(result.error).toContain('restore_db');
  });
});
