import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
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
process.env.DENTAL_PGCTL_WAIT_MS = '5';
// Backoff 1000..30000 ms * 0.005 = 5..150 ms (tartib saqlanadi).
process.env.DENTAL_RESTART_BACKOFF_SCALE = '0.005';

// CLI-390: eski test-run'lardan qolgan db-password.txt bo'lsa tozalaymiz —
// aks holda isFirstRun()'ning "fresh install" filiali bu statik (mkdtemp
// emas) DENTAL_DATA_DIR'da deterministik ishlamaydi.
rmSync(join('/tmp/dental-pm-test', 'db-password.txt'), { force: true });

const { getOrCreateDbPassword, getOrCreateSuperuserPassword } = await import('./first-run.js');

const {
  startServer,
  startApiLayer,
  startDatabaseLayer,
  stopServer,
  getServerStatus,
  onServerStatusChange,
  PortInUseError,
  RESTART_BACKOFF_MS,
  MAX_RESTARTS,
  getPostgresCommand,
  getValkeyCommand,
  getApiCommand,
} = await import('./process-manager.js');

const waitFor = async (cond: () => boolean, timeoutMs = 2000): Promise<void> => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('process-manager', () => {
  beforeEach(() => {
    spawnCalls = [];
    spawnedProcesses = [];
    failSpawnAtIndex = null;
  });

  // Kutilayotgan restart timer'lari keyingi testga oqib o'tmasin.
  afterEach(async () => {
    await stopServer();
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
    // CLI-442#8 regression guard — DATABASE_ADMIN_URL (the one intentional
    // superuser connection, used only by the recall worker's admin scan)
    // must use the persisted scram-sha-256 password, not the old hardcoded
    // `dental:dental` (which matched a trust-auth cluster with no real
    // password check at all).
    expect(env.DATABASE_ADMIN_URL).toBe(
      `postgresql://dental:${getOrCreateSuperuserPassword()}@localhost:5433/dental`,
    );
    expect(env.DATABASE_ADMIN_URL).not.toContain('dental:dental@');
    // CLI-433 — dedicated desktop-gate signal (WEB_DIST_DIR is unrelated to
    // licensing and must NOT be the gate signal; process-manager provides
    // this new flag so requireModuleInDesktop actually activates in prod).
    expect(env.DENTAL_LOCAL_DESKTOP).toBe('true');
  });

  test('LAB_HUB_URL — desktop config `labHubUrl`dan; default bo‘sh (o‘chiq), tashqi env o‘tmaydi', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'pm-config-'));
    const savedDir = process.env.DENTAL_CONFIG_DIR;
    const savedUrl = process.env.LAB_HUB_URL;
    process.env.DENTAL_CONFIG_DIR = dir;
    process.env.LAB_HUB_URL = 'http://dev-shell-leak:1';
    try {
      await startServer(8080);
      expect((spawnCalls[2]?.opts.env as Record<string, string>).LAB_HUB_URL).toBe('');
      await stopServer();

      spawnCalls = [];
      spawnedProcesses = [];
      writeFileSync(
        join(dir, 'config.json'),
        JSON.stringify({ labHubUrl: 'https://hub.example.uz/' }),
      );
      await startServer(8080);
      expect((spawnCalls[2]?.opts.env as Record<string, string>).LAB_HUB_URL).toBe(
        'https://hub.example.uz',
      );
    } finally {
      if (savedDir === undefined) delete process.env.DENTAL_CONFIG_DIR;
      else process.env.DENTAL_CONFIG_DIR = savedDir;
      if (savedUrl === undefined) delete process.env.LAB_HUB_URL;
      else process.env.LAB_HUB_URL = savedUrl;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("stopServer api/valkey'ni SIGTERM bilan, postgres'ni pg_ctl bilan to'xtatadi, status \"stopped\"", async () => {
    await startServer();
    await stopServer();

    expect(getServerStatus()).toBe('stopped');
    expect(spawnedProcesses[1]?.kill).toHaveBeenCalledWith('SIGTERM'); // valkey
    expect(spawnedProcesses[2]?.kill).toHaveBeenCalledWith('SIGTERM'); // api
  });

  test('postgres stop uses pg_ctl stop -m fast', async () => {
    await startServer();
    await stopServer();

    expect(spawnCalls).toHaveLength(4);
    const ctl = spawnCalls[3];
    expect(ctl?.cmd).toContain('pg_ctl');
    expect(ctl?.args.slice(0, 1)).toEqual(['stop']);
    expect(ctl?.args).toContain('-m');
    expect(ctl?.args[ctl.args.indexOf('-m') + 1]).toBe('fast');
    expect(ctl?.args).toContain('-w');
  });

  // CLI-442#9 — SIGTERM -> grace wait -> SIGKILL escalation. Fake processes
  // never emit 'exit' on kill(), so every wait times out and SIGKILL follows.
  test('bola jarayon vaqt ichida javob bermasa — SIGKILL bilan escalate qiladi (postgres: pg_ctl -> SIGTERM -> SIGKILL)', async () => {
    await startServer();
    await stopServer();

    expect(getServerStatus()).toBe('stopped');
    for (const proc of spawnedProcesses.slice(0, 3)) {
      expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    }
    expect(spawnedProcesses[0]?.kill).toHaveBeenCalledWith('SIGTERM'); // pg_ctl fallback
  });

  test("bola jarayonlar tez 'exit' bersa — SIGKILL yuborilmaydi", async () => {
    await startServer();
    const stopPromise = stopServer();
    // Listeners (va pg_ctl spawn) stopServer() ichida birinchi `await`gacha
    // sinxron ro'yxatdan o'tadi.
    for (const proc of spawnedProcesses) {
      proc.emit('exit', 0, null);
    }
    await stopPromise;

    expect(getServerStatus()).toBe('stopped');
    for (const proc of spawnedProcesses) {
      expect(proc.kill).not.toHaveBeenCalledWith('SIGKILL');
    }
  });

  // CLI-442#9 — crash-supervision: an unexpected exit (not part of a
  // stopServer() call) must flip status away from 'running' immediately, so
  // getServerStatus() never lies about a crashed process still running.
  test("kutilmagan crash (stopServer() chaqirilmasdan) darhol status='stopped' qiladi", async () => {
    await startServer();
    expect(getServerStatus()).toBe('running');

    // Simulate e.g. Postgres crashing on its own (OOM, corruption, ...).
    spawnedProcesses[0]?.emit('exit', 1, null);

    expect(getServerStatus()).toBe('stopped');
  });

  test('restarts api after unexpected exit with backoff', async () => {
    await startServer(8080);
    expect(spawnCalls).toHaveLength(3);
    const events: Array<{ status: string; child?: string; restarts: number; gaveUp: boolean }> = [];
    const off = onServerStatusChange((e) => events.push(e));

    spawnedProcesses[2]?.emit('exit', 1, null);
    expect(getServerStatus()).toBe('stopped');
    expect(events[0]).toMatchObject({
      status: 'stopped',
      child: 'api',
      restarts: 1,
      gaveUp: false,
    });

    await waitFor(() => spawnCalls.length === 4 && getServerStatus() === 'running');
    // Faqat api qayta spawn bo'ldi (port saqlangan)
    expect(spawnCalls[3]?.cmd).toBe(getApiCommand());
    expect((spawnCalls[3]?.opts.env as Record<string, string>).API_PORT).toBe('8080');
    expect(events.at(-1)).toMatchObject({ status: 'running', restarts: 1, gaveUp: false });
    off();

    // backoff o'sadi: 1s, 2s, 5s, 10s, 30s
    expect([...RESTART_BACKOFF_MS]).toEqual([1000, 2000, 5000, 10000, 30000]);
  });

  test('postgres crash restarts postgres and api', async () => {
    await startServer();
    spawnedProcesses[0]?.emit('exit', 1, null);

    await waitFor(() => spawnCalls.length === 5 && getServerStatus() === 'running');
    expect(spawnCalls[3]?.cmd).toBe(getPostgresCommand());
    expect(spawnCalls[4]?.cmd).toBe(getApiCommand());
    // eski api to'xtatildi
    expect(spawnedProcesses[2]?.kill).toHaveBeenCalledWith('SIGTERM');
  });

  test('gives up after 5 crashes and reports gaveUp', async () => {
    await startServer();
    const events: Array<{ status: string; restarts: number; gaveUp: boolean }> = [];
    const off = onServerStatusChange((e) => events.push(e));

    for (let i = 0; i < MAX_RESTARTS; i++) {
      const before = spawnCalls.length;
      spawnedProcesses[spawnedProcesses.length - 1]?.emit('exit', 1, null);
      await waitFor(() => spawnCalls.length === before + 1 && getServerStatus() === 'running');
    }
    expect(spawnCalls).toHaveLength(3 + MAX_RESTARTS);

    // keyingi yiqilish — urinishlar tugagan
    spawnedProcesses[spawnedProcesses.length - 1]?.emit('exit', 1, null);
    expect(events.at(-1)).toMatchObject({ status: 'stopped', gaveUp: true });
    await new Promise((r) => setTimeout(r, 40));
    expect(spawnCalls).toHaveLength(3 + MAX_RESTARTS);
    expect(getServerStatus()).toBe('stopped');
    off();
  });

  test('intentional stop does not restart', async () => {
    await startServer();
    await stopServer();
    const count = spawnCalls.length;
    for (const proc of spawnedProcesses) proc.emit('exit', 0, null);
    await new Promise((r) => setTimeout(r, 40));
    expect(spawnCalls).toHaveLength(count);
    expect(getServerStatus()).toBe('stopped');
  });

  test("DT-02: api port band (EADDRINUSE) — startApiLayer PortInUseError, restart yo'q", async () => {
    await startDatabaseLayer();
    const p = startApiLayer(8080);
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    const api = spawnedProcesses[2];
    api?.stderr.emit('data', Buffer.from('error: EADDRINUSE: address already in use :::8080'));
    await expect(p).rejects.toBeInstanceOf(PortInUseError);
    api?.emit('exit', 1, null);
    const count = spawnCalls.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(spawnCalls).toHaveLength(count);
    expect(getServerStatus()).toBe('stopped');
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
