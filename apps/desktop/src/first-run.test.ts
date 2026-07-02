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

mock.module('electron', () => ({ app: { isPackaged: false } }));
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

const { isFirstRun, runFirstSetup, runMigrations } = await import('./first-run');

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

  test("initdb muvaffaqiyatli bo'lsa papkalar yaratiladi va conf fayllar nusxalanadi", () => {
    spawnSyncImpl = mock(() => ({ status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') }));

    expect(() => runFirstSetup()).not.toThrow();
    expect(existsSync(join(tmpDir, 'uploads'))).toBe(true);
    expect(existsSync(join(tmpDir, 'logs'))).toBe(true);
    expect(existsSync(join(tmpDir, 'postgres', 'data'))).toBe(true);
    expect(copyFileSyncImpl).toHaveBeenCalledTimes(2);
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
    spawnSyncImpl = mock(() => ({ status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') }));
    expect(() => runMigrations('C:\\api.exe')).not.toThrow();
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
