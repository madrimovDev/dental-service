import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 'electron', 'node:child_process' (spawnSync) va 'node:fs' (copyFileSync)
// mock qilinadi — mock.module BEFORE any dynamic import of './first-run'
// resolves it (license-client.test.ts pattern). mkdirSync/existsSync haqiqiy
// qoladi — testlar real tmp papkaga yozadi/o'qiydi (config.test.ts pattern).
const realFs = await import('node:fs');
const realChildProcess = await import('node:child_process');

type SpawnSyncResult = { status: number | null; stdout: Buffer; stderr: Buffer; error?: Error };

let spawnSyncImpl: (...args: unknown[]) => SpawnSyncResult = () => ({
  status: 0,
  stdout: Buffer.from(''),
  stderr: Buffer.from(''),
});
let copyFileSyncImpl: (...args: unknown[]) => void = () => {};

// side-effect import — bitta umumiy 'electron' mock (test-electron-mock.ts
// izohiga qarang: alohida-alohida mock.module('electron', ...) chaqiruvlar
// fayllar orasidagi racy natija berardi, chunki 'electron' moduli global).
await import('./test-electron-mock.js');
// Boshqa test fayl (process-manager.test.ts) ham 'node:child_process' ni
// mock qiladi va bitta `bun test` invokatsiyasida modul registry global —
// shu sabab real modul spread qilinadi (faqat `spawnSync` override qilinadi).
mock.module('node:child_process', () => ({
  ...realChildProcess,
  spawnSync: (...args: unknown[]) => spawnSyncImpl(...args),
}));
mock.module('node:fs', () => ({
  ...realFs,
  copyFileSync: (...args: unknown[]) => copyFileSyncImpl(...args),
}));

const {
  isFirstRun,
  runFirstSetup,
  runMigrations,
  getOrCreateJwtSecret,
  getOrCreateDbPassword,
  getOrCreateSuperuserPassword,
} = await import('./first-run.js');

describe('isFirstRun', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'first-run-test-'));
    process.env.DENTAL_DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.DENTAL_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('PG_VERSION mavjud emas -> true', () => {
    expect(isFirstRun()).toBe(true);
  });

  test('PG_VERSION mavjud -> false', async () => {
    await mkdir(join(tmpDir, 'postgres', 'data'), { recursive: true });
    await writeFile(join(tmpDir, 'postgres', 'data', 'PG_VERSION'), '16');
    expect(isFirstRun()).toBe(false);
  });
});

describe('runFirstSetup', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'first-run-test-'));
    process.env.DENTAL_DATA_DIR = tmpDir;
    copyFileSyncImpl = mock(() => {});
  });

  afterEach(async () => {
    delete process.env.DENTAL_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("initdb muvaffaqiyatli bo'lsa papkalar yaratiladi, conf fayllar nusxalanadi va JWT_SECRET generatsiya qilinadi", () => {
    const spawnMock = mock((..._args: unknown[]) => ({
      status: 0,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
    }));
    spawnSyncImpl = spawnMock;

    expect(() => runFirstSetup()).not.toThrow();
    expect(existsSync(join(tmpDir, 'uploads'))).toBe(true);
    expect(existsSync(join(tmpDir, 'logs'))).toBe(true);
    expect(existsSync(join(tmpDir, 'postgres', 'data'))).toBe(true);
    expect(copyFileSyncImpl).toHaveBeenCalledTimes(2);
    expect(existsSync(join(tmpDir, 'jwt-secret.txt'))).toBe(true);

    // CLI-442#8 — superuser paroli persisted + initdb scram-sha-256 bilan
    // chaqirilgan (trust auth EMAS — parolsiz lokal ulanish RLS'ni chetlab
    // o'tishi mumkin edi).
    expect(existsSync(join(tmpDir, 'superuser-password.txt'))).toBe(true);
    const initdbArgs = spawnMock.mock.calls[0]?.[1] as string[];
    expect(initdbArgs).toContain('-A');
    expect(initdbArgs).toContain('scram-sha-256');
    expect(initdbArgs).toContain('--pwfile');
    expect(initdbArgs).toContain(join(tmpDir, 'superuser-password.txt'));
  });

  test("initdb muvaffaqiyatsiz bo'lsa (status != 0) throw qiladi", () => {
    spawnSyncImpl = mock(() => ({
      status: 1,
      stdout: Buffer.from(''),
      stderr: Buffer.from('initdb: boom'),
    }));

    expect(() => runFirstSetup()).toThrow(/initdb failed/);
  });

  test('initdb binary topilmasa (spawnSync error) throw qiladi', () => {
    spawnSyncImpl = mock(() => ({
      status: null,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      error: new Error('ENOENT'),
    }));

    expect(() => runFirstSetup()).toThrow(/initdb failed/);
  });
});

describe('runMigrations', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'first-run-test-'));
    process.env.DENTAL_DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.DENTAL_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("migration muvaffaqiyatli bo'lsa throw qilmaydi", () => {
    const spawnMock = mock((..._args: unknown[]) => ({
      status: 0,
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
    }));
    spawnSyncImpl = spawnMock;
    expect(() => runMigrations('C:\\api.exe')).not.toThrow();

    // CLI-442#8 regression guard — DATABASE_URL/DATABASE_ADMIN_URL use the
    // persisted superuser password, NOT the hardcoded `dental:dental` literal
    // (which matched the old trust-auth cluster with no real password).
    const opts = spawnMock.mock.calls[0]?.[2] as { env: Record<string, string> };
    const superuserPassword = getOrCreateSuperuserPassword();
    expect(opts.env.DATABASE_URL).toBe(
      `postgresql://dental:${superuserPassword}@localhost:5433/dental`,
    );
    expect(opts.env.DATABASE_ADMIN_URL).toBe(
      `postgresql://dental:${superuserPassword}@localhost:5433/dental`,
    );
    expect(opts.env.DATABASE_URL).not.toContain('dental:dental@');
  });

  test("migration muvaffaqiyatsiz bo'lsa throw qiladi", () => {
    spawnSyncImpl = mock(() => ({
      status: 1,
      stdout: Buffer.from(''),
      stderr: Buffer.from('migration error'),
    }));
    expect(() => runMigrations('C:\\api.exe')).toThrow(/Migrations failed/);
  });
});

describe('getOrCreateJwtSecret', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'first-run-test-'));
    process.env.DENTAL_DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.DENTAL_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('birinchi chaqiruvda faylni yaratadi va API talabini (32+ belgi) qanoatlantiradi', () => {
    const secret = getOrCreateJwtSecret();
    expect(existsSync(join(tmpDir, 'jwt-secret.txt'))).toBe(true);
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  test('idempotent — ikkinchi chaqiruvda bir xil qiymatni qaytaradi (qayta yozmaydi)', () => {
    const first = getOrCreateJwtSecret();
    const second = getOrCreateJwtSecret();
    expect(second).toBe(first);
  });
});

describe('getOrCreateDbPassword', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'first-run-test-'));
    process.env.DENTAL_DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.DENTAL_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("fresh install (PG_VERSION yo'q) — tasodifiy parol generatsiya qiladi va faylga yozadi", () => {
    const password = getOrCreateDbPassword();
    expect(existsSync(join(tmpDir, 'db-password.txt'))).toBe(true);
    expect(password).not.toBe('dental_app_local_dev');
    expect(password.length).toBeGreaterThanOrEqual(32);
  });

  test('idempotent — ikkinchi chaqiruvda bir xil qiymatni qaytaradi (qayta yozmaydi)', () => {
    const first = getOrCreateDbPassword();
    const second = getOrCreateDbPassword();
    expect(second).toBe(first);
  });

  test("mavjud o'rnatish (PG_VERSION allaqachon bor) — eski hardcoded literalni qaytaradi (upgrade-safety, CLI-390)", async () => {
    // Postgres klasteri "allaqachon mavjud" holatini simulyatsiya qilamiz —
    // isFirstRun() shu faylga qarab true/false qaytaradi.
    await mkdir(join(tmpDir, 'postgres', 'data'), { recursive: true });
    await writeFile(join(tmpDir, 'postgres', 'data', 'PG_VERSION'), '16');

    const password = getOrCreateDbPassword();
    expect(password).toBe('dental_app_local_dev');
  });
});

describe('getOrCreateSuperuserPassword (CLI-442#8)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'first-run-test-'));
    process.env.DENTAL_DATA_DIR = tmpDir;
  });

  afterEach(async () => {
    delete process.env.DENTAL_DATA_DIR;
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('birinchi chaqiruvda tasodifiy parol generatsiya qiladi va faylga yozadi', () => {
    const password = getOrCreateSuperuserPassword();
    expect(existsSync(join(tmpDir, 'superuser-password.txt'))).toBe(true);
    expect(password.length).toBeGreaterThanOrEqual(32);
  });

  test('idempotent — ikkinchi chaqiruvda bir xil qiymatni qaytaradi (qayta yozmaydi)', () => {
    const first = getOrCreateSuperuserPassword();
    const second = getOrCreateSuperuserPassword();
    expect(second).toBe(first);
  });
});
