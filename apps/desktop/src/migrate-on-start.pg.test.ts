/**
 * P2 — `createPgTools` real-adapter testi (real Postgres + pg_dump/pg_restore/psql).
 *
 * Faqat `P2_PG_TEST=1` bo'lsa ishlaydi (CI/desktop to'plamida PG yo'q). Scratch
 * baza `p2_restore_scratch` ishlatiladi — ilova bazasi (`dental`) HECH QACHON
 * tegilmaydi. Env: `P2_PG_HOST` (localhost), `P2_PG_PORT` (5433), `P2_PG_USER`
 * (dental), `P2_PG_PASSWORD`, `P2_PG_BIN_DIR` (ixtiyoriy — server versiyasiga mos
 * pg_dump/pg_restore/psql papkasi; host'dagi pg_dump yangiroq bo'lsa dump eski
 * serverga tiklanmaydi, masalan PG18 `transaction_timeout`).
 *
 *   cd apps/desktop && P2_PG_TEST=1 P2_PG_PASSWORD=… bun test src/migrate-on-start.pg.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `dump` backups papkasini yaratadi — test uchun vaqtinchalik dataDir.
process.env.DENTAL_DATA_DIR ??= mkdtempSync(join(tmpdir(), 'p2-data-'));
await import('./test-electron-mock.js');
const { createPgTools } = await import('./migrate-on-start.js');

const enabled = process.env.P2_PG_TEST === '1';
const host = process.env.P2_PG_HOST ?? 'localhost';
const port = process.env.P2_PG_PORT ?? '5433';
const user = process.env.P2_PG_USER ?? 'dental';
const password = process.env.P2_PG_PASSWORD ?? '';
const DB = 'p2_restore_scratch';
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

describe.skipIf(!enabled)('createPgTools — real Postgres (P2)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p2-pg-'));
  const tools = createPgTools({
    host,
    port,
    user,
    database: DB,
    password: () => password,
    bin: pgBin,
  });

  beforeAll(() => {
    psql('postgres', `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    psql('postgres', `CREATE DATABASE ${DB}`);
    psql(DB, 'CREATE TABLE patients (id int primary key, name text)');
    psql(DB, "INSERT INTO patients VALUES (1, 'Ali')");
  });

  afterAll(() => {
    psql('postgres', `DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    rmSync(dir, { recursive: true, force: true });
  });

  test('restore removes objects a failed migration left behind and keeps the data', () => {
    const file = join(dir, 'pre.dump');
    tools.dump(file);
    // «Yarim migratsiya»: yangi jadval + ustun + qator o'zgarishi.
    psql(DB, 'CREATE TABLE new_t (id int)');
    psql(DB, 'ALTER TABLE patients ADD COLUMN c int');
    psql(DB, "UPDATE patients SET name = 'Buzilgan'");

    tools.restore(file);

    expect(
      psql(DB, "select count(*) from information_schema.tables where table_name = 'new_t'"),
    ).toBe('0');
    expect(
      psql(
        DB,
        "select count(*) from information_schema.columns where table_name = 'patients' and column_name = 'c'",
      ),
    ).toBe('0');
    expect(psql(DB, 'select name from patients where id = 1')).toBe('Ali');
  });

  test('unreadable dump is rejected BEFORE the database is dropped', () => {
    const bad = join(dir, 'bad.dump');
    writeFileSync(bad, 'not a pg dump');
    expect(() => tools.restore(bad)).toThrow(/pg_restore --list failed/);
    // Baza joyida, ma'lumot saqlangan.
    expect(psql(DB, 'select name from patients where id = 1')).toBe('Ali');
  });
});
