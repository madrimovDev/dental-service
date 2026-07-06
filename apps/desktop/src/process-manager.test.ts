import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

// 'electron' va 'node:child_process' mock qilinadi — mock.module BEFORE any
// dynamic import of './process-manager' resolves it (bun mock.module must be
// registered up front, license-client.test.ts pattern).
class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = mock((_signal?: string) => true);
}

let spawnCalls: Array<{ cmd: string; args: string[]; opts: Record<string, unknown> }> = [];
let spawnedProcesses: FakeChildProcess[] = [];
// Test tanlab bitta spawn chaqiruvini (0-indeksli) "binary topilmadi" holatiga
// o'tkazishi mumkin — 'error' emit qilinadi, "ready" signali emas.
let failSpawnAtIndex: number | null = null;

const realChildProcess = await import('node:child_process');

// side-effect import — bitta umumiy 'electron' mock (test-electron-mock.ts
// izohiga qarang: alohida-alohida mock.module('electron', ...) chaqiruvlar
// fayllar orasidagi racy natija berardi, chunki 'electron' moduli global).
await import('./test-electron-mock.js');
// Boshqa test fayl (first-run.test.ts) ham 'node:child_process' ni mock
// qiladi va bitta `bun test` invokatsiyasida modul registry global — shu
// sabab real modul spread qilinadi (faqat `spawn` override qilinadi,
// `spawnSync` boshqa faylga tegishli bo'lib qoladi).
mock.module('node:child_process', () => ({
  ...realChildProcess,
  spawn: (cmd: string, args: string[] = [], opts: Record<string, unknown> = {}) => {
    const index = spawnCalls.length;
    spawnCalls.push({ cmd, args, opts });
    const proc = new FakeChildProcess();
    spawnedProcesses.push(proc);
    // Real spawn'dagi kabi keyingi tick'da signalni chiqaramiz —
    // spawnPostgres/spawnValkey/spawnApi promise executor listener'ni
    // synchronous ravishda ulaydi, shu sabab bu keyinroq keladigan emission
    // qo'lga tushadi.
    queueMicrotask(() => {
      if (failSpawnAtIndex === index) {
        proc.emit('error', new Error('spawn ENOENT'));
        return;
      }
      proc.stdout.emit('data', Buffer.from('database system is ready to accept connections'));
    });
    return proc;
  },
}));

// Timeout'lar testda tezlashtiriladi (production defaultlari 3000/1000/2000/1000ms).
process.env.DENTAL_DATA_DIR = '/tmp/dental-pm-test';
process.env.DENTAL_PG_READY_TIMEOUT_MS = '20';
process.env.DENTAL_VALKEY_READY_DELAY_MS = '5';
process.env.DENTAL_API_READY_DELAY_MS = '5';
process.env.DENTAL_STOP_WAIT_MS = '5';

// CLI-390: eski test-run'lardan qolgan db-password.txt bo'lsa tozalaymiz —
// aks holda isFirstRun()'ning "fresh install" filiali bu statik (mkdtemp
// emas) DENTAL_DATA_DIR'da deterministik ishlamaydi.
rmSync(join('/tmp/dental-pm-test', 'db-password.txt'), { force: true });

const { getOrCreateDbPassword } = await import('./first-run.js');

const {
  startServer,
  stopServer,
  getServerStatus,
  getPostgresCommand,
  getValkeyCommand,
  getApiCommand,
} = await import('./process-manager.js');

describe('process-manager', () => {
  beforeEach(() => {
    spawnCalls = [];
    spawnedProcesses = [];
    failSpawnAtIndex = null;
  });

  test('boshlang\'ich holat "stopped"', () => {
    expect(getServerStatus()).toBe('stopped');
  });

  test('startServer postgres -> valkey -> api ketma-ket ishga tushiradi, status "running"', async () => {
    await startServer(8080);

    expect(getServerStatus()).toBe('running');
    expect(spawnCalls).toHaveLength(3);
    // Platform-mos komandalar — joriy testni ishga tushirayotgan platformadan
    // mustaqil (`getPostgresCommand()`/`getValkeyCommand()`/`getApiCommand()`
    // ham xuddi shu default `process.platform`ni ishlatadi, alohida
    // `describe('platform-mos komandalar')` blokida win32 va boshqa
    // platformalar aniq sinaladi).
    expect(spawnCalls[0]?.cmd).toBe(getPostgresCommand());
    expect(spawnCalls[1]?.cmd).toBe(getValkeyCommand());
    expect(spawnCalls[2]?.cmd).toBe(getApiCommand());
    expect(spawnCalls[2]?.opts.env).toMatchObject({
      API_PORT: '8080',
      REDIS_URL: 'redis://localhost:6380',
      RUN_REMINDER_WORKER: 'true',
      NODE_ENV: 'production',
      WEB_ORIGIN: 'http://localhost:8080',
    });
    const env = spawnCalls[2]?.opts.env as Record<string, string>;
    expect(env.JWT_SECRET?.length).toBeGreaterThanOrEqual(32);
    expect(env.WEB_DIST_DIR).toContain('web');
    // Regression guard (2026-07-02 xavfsizlik bugi): runtime HECH QACHON
    // superuser (`dental`) bilan ulanmasin — Postgres'da superuser RLS'ni
    // avtomatik chetlab o'tadi, butun tenant izolyatsiyasini yo'qqa chiqaradi.
    expect(env.DATABASE_URL).toContain('dental_app');
    expect(env.DATABASE_URL).not.toMatch(/:\/\/dental:/);
    // Regression guard (CLI-390): parol endi committed literal EMAS — persisted
    // (first-run.ts) qiymatdan qurilgan bo'lishi shart.
    expect(env.DATABASE_URL).not.toContain('dental_app:dental_app_local_dev');
    expect(env.DATABASE_URL).toBe(
      `postgresql://dental_app:${getOrCreateDbPassword()}@localhost:5433/dental`,
    );
  });

  test('stopServer barcha child process\'larni SIGTERM bilan to\'xtatadi, status "stopped"', async () => {
    await startServer();
    await stopServer();

    expect(getServerStatus()).toBe('stopped');
    expect(spawnedProcesses).toHaveLength(3);
    for (const proc of spawnedProcesses) {
      expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    }
  });

  test('valkey binary topilmasa (spawn error) startServer reject qiladi', async () => {
    failSpawnAtIndex = 1; // 0=postgres (ok), 1=valkey (fail)

    await expect(startServer()).rejects.toThrow(/ENOENT/);
  });

  test('api.exe topilmasa (spawn error) startServer reject qiladi', async () => {
    failSpawnAtIndex = 2; // 0=postgres, 1=valkey (ok), 2=api (fail)

    await expect(startServer()).rejects.toThrow(/ENOENT/);
  });
});

describe('platform-mos komandalar', () => {
  test("win32 — bundled portable binary yo'llari (.exe, resources/ ostida)", () => {
    expect(getPostgresCommand('win32')).toContain('postgres.exe');
    expect(getValkeyCommand('win32')).toContain('valkey-server.exe');
    expect(getApiCommand('win32')).toContain('api.exe');
  });

  test('linux/darwin — tizim PATH (postgres/valkey-server bare nom), api hali bundled', () => {
    expect(getPostgresCommand('linux')).toBe('postgres');
    expect(getValkeyCommand('linux')).toBe('valkey-server');
    expect(getPostgresCommand('darwin')).toBe('postgres');
    expect(getValkeyCommand('darwin')).toBe('valkey-server');
    expect(getApiCommand('linux')).toContain('api');
    expect(getApiCommand('linux')).not.toContain('.exe');
  });
});
