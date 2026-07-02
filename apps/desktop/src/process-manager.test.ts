import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { EventEmitter } from 'node:events';

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

const realChildProcess = await import('node:child_process');

mock.module('electron', () => ({ app: { isPackaged: false } }));
// Boshqa test fayl (first-run.test.ts) ham 'node:child_process' ni mock
// qiladi va bitta `bun test` invokatsiyasida modul registry global — shu
// sabab real modul spread qilinadi (faqat `spawn` override qilinadi,
// `spawnSync` boshqa faylga tegishli bo'lib qoladi).
mock.module('node:child_process', () => ({
  ...realChildProcess,
  spawn: (cmd: string, args: string[] = [], opts: Record<string, unknown> = {}) => {
    spawnCalls.push({ cmd, args, opts });
    const proc = new FakeChildProcess();
    spawnedProcesses.push(proc);
    // Real spawn'dagi kabi keyingi tick'da "ready" signalini chiqaramiz —
    // spawnPostgres promise executor listener'ni synchronous ravishda
    // ulaydi, shu sabab bu keyinroq keladigan emission qo'lga tushadi.
    queueMicrotask(() => {
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

const { startServer, stopServer, getServerStatus } = await import('./process-manager');

describe('process-manager', () => {
  beforeEach(() => {
    spawnCalls = [];
    spawnedProcesses = [];
  });

  test('boshlang\'ich holat "stopped"', () => {
    expect(getServerStatus()).toBe('stopped');
  });

  test('startServer postgres -> valkey -> api ketma-ket ishga tushiradi, status "running"', async () => {
    await startServer(8080);

    expect(getServerStatus()).toBe('running');
    expect(spawnCalls).toHaveLength(3);
    expect(spawnCalls[0]?.cmd).toContain('postgres.exe');
    expect(spawnCalls[1]?.cmd).toContain('valkey-server.exe');
    expect(spawnCalls[2]?.cmd).toContain('api.exe');
    expect(spawnCalls[2]?.opts.env).toMatchObject({
      API_PORT: '8080',
      DATABASE_URL: 'postgresql://dental:dental@localhost:5433/dental',
      REDIS_URL: 'redis://localhost:6380',
      RUN_REMINDER_WORKER: 'true',
      NODE_ENV: 'production',
    });
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
});
