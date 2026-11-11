/**
 * UI-3 / D.1 — zaxira rejalashtiruvchisi (spy dep; fayl-tizimi — real vaqtinchalik papka).
 * Real Postgres/tar bilan: `backup-scheduler.pg.test.ts`.
 *
 *   cd apps/desktop && bun test src/backup-scheduler.test.ts
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BACKUP_RETENTION,
  type BackupSchedulerDeps,
  backupStamp,
  createBackupScheduler,
  nextBackupTime,
  resolveDefaultBackupFolder,
} from './backup-scheduler.js';
import { createMaintenanceServer } from './backup-tools.js';

let dataDir: string;
let folder: string;
let clock: Date;
let calls: string[];
let failDump: boolean;
let failRestoreOnce: boolean;

const makeDeps = (over: Partial<BackupSchedulerDeps> = {}): BackupSchedulerDeps => ({
  now: () => clock,
  timers: {
    setTimeout: () => 1,
    clearTimeout: () => {},
    setInterval: () => 2,
    clearInterval: () => {},
  },
  getDataDir: () => dataDir,
  defaultFolder: () => join(dataDir, 'default-backups'),
  dump: (file) => {
    calls.push('dump');
    if (failDump) throw new Error('pg_dump failed: boom');
    writeFileSync(file, 'DUMP');
  },
  restoreDb: (file) => {
    calls.push(`restoreDb:${readFileSync(file, 'utf8')}`);
    if (failRestoreOnce) {
      failRestoreOnce = false;
      throw new Error('pg_restore failed: halfway');
    }
  },
  archiveUploads: (dest) => {
    calls.push('archive');
    writeFileSync(dest, 'TAR');
    return true;
  },
  extractUploads: () => calls.push('extract'),
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
  ...over,
});

const seedBackup = (name: string, dump = 'DUMP') => {
  mkdirSync(join(folder, name), { recursive: true });
  writeFileSync(join(folder, name, 'db.dump'), dump);
  writeFileSync(join(folder, name, 'uploads.tar'), 'TAR');
};

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'bk-sched-'));
  folder = join(dataDir, 'zaxira');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(dataDir, 'backup-settings.json'), JSON.stringify({ folder }));
  clock = new Date(2026, 10, 11, 20, 0, 5);
  calls = [];
  failDump = false;
  failRestoreOnce = false;
});
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

describe('nextBackupTime', () => {
  test('20:00 dan oldin — bugun 20:00', () => {
    const n = nextBackupTime(new Date(2026, 10, 11, 9, 30));
    expect([n.getDate(), n.getHours(), n.getMinutes()]).toEqual([11, 20, 0]);
  });
  test('20:00 o‘tgan (yoki aynan 20:00) — ertaga 20:00; oy chegarasi', () => {
    const a = nextBackupTime(new Date(2026, 10, 11, 20, 0, 0));
    expect([a.getDate(), a.getHours()]).toEqual([12, 20]);
    const b = nextBackupTime(new Date(2026, 10, 30, 23, 59));
    expect([b.getMonth(), b.getDate(), b.getHours()]).toEqual([11, 1, 20]);
  });
});

describe('resolveDefaultBackupFolder', () => {
  const base = { dataDir: '/data' };
  test('Windows: D: bor -> D:\\DentalBackup, yo‘q -> C:\\DentalBackup', () => {
    expect(
      resolveDefaultBackupFolder({ ...base, platform: 'win32', driveExists: () => true }),
    ).toBe('D:\\DentalBackup');
    expect(
      resolveDefaultBackupFolder({ ...base, platform: 'win32', driveExists: () => false }),
    ).toBe('C:\\DentalBackup');
  });
  test('Linux dev: <dataDir>/backups', () => {
    expect(
      resolveDefaultBackupFolder({ ...base, platform: 'linux', driveExists: () => false }),
    ).toBe(join('/data', 'backups'));
  });
});

describe('runBackup', () => {
  test('nusxa yaratadi: db.dump + uploads.tar, holat faylini yozadi', async () => {
    const s = createBackupScheduler(makeDeps());
    const r = await s.runBackup('scheduled');
    expect(r).toEqual({ ok: true, name: `dental-${backupStamp(clock)}` });
    expect(readdirSync(join(folder, `dental-${backupStamp(clock)}`)).sort()).toEqual([
      'db.dump',
      'uploads.tar',
    ]);
    const state = JSON.parse(readFileSync(join(dataDir, 'backup-state.json'), 'utf8'));
    expect(state.lastError).toBeNull();
    expect(state.lastSuccessAt).toBe(clock.toISOString());
  });

  test('retention: 14 dan oshsa eng eskisi o‘chadi, eng yangisi (yangi olingan) qoladi', async () => {
    // 14 ta mavjud (01..14 noyabr), yangisi 11-noyabr 20:00:05 dan keyin: hammasi eskirmagan nomlar.
    for (let d = 1; d <= BACKUP_RETENTION; d++) {
      seedBackup(`dental-202610${String(d).padStart(2, '0')}-200000`);
    }
    const s = createBackupScheduler(makeDeps());
    const r = await s.runBackup('scheduled');
    expect(r.ok).toBe(true);
    const names = s.listBackups(folder);
    expect(names.length).toBe(BACKUP_RETENTION);
    expect(names[0]).toBe(`dental-${backupStamp(clock)}`); // eng yangisi saqlangan
    expect(names).not.toContain('dental-20261001-200000'); // eng eskisi o‘chgan
    expect(names).toContain('dental-20261002-200000');
  });

  test('yiqilgan dump: yarim papka qolmaydi, eski nusxalar tegilmaydi, xato holatga yoziladi', async () => {
    seedBackup('dental-20261001-200000');
    failDump = true;
    const s = createBackupScheduler(makeDeps());
    const r = await s.runBackup('manual');
    expect(r.ok).toBe(false);
    expect(readdirSync(folder)).toEqual(['dental-20261001-200000']);
    const state = JSON.parse(readFileSync(join(dataDir, 'backup-state.json'), 'utf8'));
    expect(state.lastError).toContain('boom');
  });

  test('retention yarim (.partial) va begona papkalarga tegmaydi/hisoblamaydi', async () => {
    mkdirSync(join(folder, 'pre-migrate-0.1.1-x'), { recursive: true });
    const s = createBackupScheduler(makeDeps());
    await s.runBackup('scheduled');
    expect(existsSync(join(folder, 'pre-migrate-0.1.1-x'))).toBe(true);
  });
});

describe('so‘rov fayllari (poll)', () => {
  test('backup-request.json -> zaxira olinadi va so‘rov o‘chadi', async () => {
    writeFileSync(join(dataDir, 'backup-request.json'), '{}');
    const s = createBackupScheduler(makeDeps());
    await s.poll();
    expect(existsSync(join(dataDir, 'backup-request.json'))).toBe(false);
    expect(s.listBackups(folder).length).toBe(1);
  });

  test('restore-request.json: API stop -> texnik-ish -> pre-restore zaxira -> restoreDb -> uploads -> migratsiya -> API start', async () => {
    seedBackup('dental-20261001-200000', 'TARGET');
    writeFileSync(
      join(dataDir, 'restore-request.json'),
      JSON.stringify({ file: 'dental-20261001-200000' }),
    );
    const s = createBackupScheduler(makeDeps());
    await s.poll();

    expect(calls).toEqual([
      'stopApi',
      'maint:start',
      'dump', // tiklashdan oldin avtomatik zaxira
      'archive',
      'restoreDb:TARGET',
      'extract',
      'migrate',
      'maint:stop',
      'startApi',
    ]);
    expect(existsSync(join(dataDir, 'restore-request.json'))).toBe(false);
    const result = JSON.parse(readFileSync(join(dataDir, 'restore-result.json'), 'utf8'));
    expect(result.status).toBe('ok');
    // Tiklanayotgan nusxa o‘chmagan, pre-restore nusxa qo‘shilgan.
    expect(s.listBackups(folder).length).toBe(2);
  });

  test('pre-restore zaxira yiqilsa: baza tegilmaydi (restoreDb yo‘q), API qaytadi, xato yoziladi', async () => {
    seedBackup('dental-20261001-200000', 'TARGET');
    writeFileSync(
      join(dataDir, 'restore-request.json'),
      JSON.stringify({ file: 'dental-20261001-200000' }),
    );
    failDump = true;
    const s = createBackupScheduler(makeDeps());
    await s.poll();
    expect(calls.some((c) => c.startsWith('restoreDb'))).toBe(false);
    expect(calls.slice(-2)).toEqual(['maint:stop', 'startApi']);
    const result = JSON.parse(readFileSync(join(dataDir, 'restore-result.json'), 'utf8'));
    expect(result.status).toBe('failed');
    expect(result.error).toContain('pre_restore_backup');
  });

  test('restoreDb yarim yiqilsa: tiklashdan oldingi nusxaga qaytariladi', async () => {
    seedBackup('dental-20261001-200000', 'TARGET');
    writeFileSync(
      join(dataDir, 'restore-request.json'),
      JSON.stringify({ file: 'dental-20261001-200000' }),
    );
    failRestoreOnce = true;
    const s = createBackupScheduler(makeDeps());
    await s.poll();
    const restores = calls.filter((c) => c.startsWith('restoreDb'));
    expect(restores).toEqual(['restoreDb:TARGET', 'restoreDb:DUMP']); // DUMP = pre-restore nusxa
    expect(calls).not.toContain('migrate');
    expect(calls.slice(-1)).toEqual(['startApi']);
  });

  test('yaroqsiz fayl nomi (../) — hech narsa to‘xtatilmaydi, baza tegilmaydi', async () => {
    writeFileSync(
      join(dataDir, 'restore-request.json'),
      JSON.stringify({ file: '../../etc/passwd' }),
    );
    const s = createBackupScheduler(makeDeps());
    await s.poll();
    expect(calls).toEqual([]);
    const result = JSON.parse(readFileSync(join(dataDir, 'restore-result.json'), 'utf8'));
    expect(result.status).toBe('failed');
  });
});

describe('start/stop taymerlari', () => {
  test('start: keyingi 20:00 gacha setTimeout + 2 s polling; stop ikkalasini tozalaydi', () => {
    clock = new Date(2026, 10, 11, 18, 0, 0);
    const delays: number[] = [];
    const cleared: unknown[] = [];
    const s = createBackupScheduler(
      makeDeps({
        timers: {
          setTimeout: (_fn, ms) => {
            delays.push(ms);
            return 'T';
          },
          clearTimeout: (h) => cleared.push(h),
          setInterval: (_fn, ms) => {
            delays.push(ms);
            return 'I';
          },
          clearInterval: (h) => cleared.push(h),
        },
      }),
    );
    s.start();
    expect(delays).toEqual([2 * 60 * 60 * 1000, 2000]);
    s.stop();
    expect(cleared).toEqual(['T', 'I']);
  });
});

describe('tiklash: API va texnik-ish serveri BIR XIL portda (real http)', () => {
  const listen = (port: number): Promise<Server> =>
    new Promise((resolve, reject) => {
      const srv = createServer((_req, res) => res.end('api'));
      srv.once('error', reject);
      srv.listen(port, () => resolve(srv));
    });
  const close = (srv: Server): Promise<void> =>
    new Promise((resolve) => {
      srv.closeAllConnections();
      srv.close(() => resolve());
    });
  const requestFile = () =>
    writeFileSync(
      join(dataDir, 'restore-request.json'),
      JSON.stringify({ file: 'dental-20261001-200000' }),
    );

  test('API ishlab turgan portda tiklash: avval API to‘xtaydi, so‘ng maintenance 503 beradi, oxirida API qaytadi', async () => {
    seedBackup('dental-20261001-200000', 'TARGET');
    requestFile();
    const port = 19000 + Math.floor(Math.random() * 1000);
    let api: Server | null = await listen(port);
    const maint = createMaintenanceServer(() => port);
    let statusDuring = 0;
    const s = createBackupScheduler(
      makeDeps({
        stopApi: async () => {
          calls.push('stopApi');
          if (api) await close(api);
          api = null;
        },
        startApi: async () => {
          calls.push('startApi');
          api = await listen(port);
        },
        maintenance: {
          start: async () => {
            await maint.start();
            calls.push('maint:start');
            statusDuring = (await fetch(`http://127.0.0.1:${port}/`)).status;
          },
          stop: async () => {
            calls.push('maint:stop');
            await maint.stop();
          },
        },
      }),
    );
    try {
      await s.poll();
      const result = JSON.parse(readFileSync(join(dataDir, 'restore-result.json'), 'utf8'));
      expect(result.status).toBe('ok');
      expect(statusDuring).toBe(503);
      expect(calls[0]).toBe('stopApi');
      expect(calls.indexOf('maint:start')).toBeGreaterThan(calls.indexOf('stopApi'));
      expect(calls.slice(-2)).toEqual(['maint:stop', 'startApi']);
      // API qaytdi, texnik-ish serveri portni bo‘shatgan.
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('api');
    } finally {
      if (api) await close(api);
      await maint.stop();
    }
  });

  test('maintenance.start yiqilsa: yakuniy natija "failed" yoziladi, baza tegilmaydi, API qaytadi (running qolib ketmaydi)', async () => {
    seedBackup('dental-20261001-200000', 'TARGET');
    requestFile();
    const s = createBackupScheduler(
      makeDeps({
        maintenance: {
          start: async () => {
            calls.push('maint:start');
            throw new Error('EADDRINUSE');
          },
          stop: async () => {
            calls.push('maint:stop');
          },
        },
      }),
    );
    await s.poll();
    const result = JSON.parse(readFileSync(join(dataDir, 'restore-result.json'), 'utf8'));
    expect(result.status).toBe('failed');
    expect(result.error).toContain('maintenance_start');
    expect(calls.some((c) => c.startsWith('restoreDb'))).toBe(false);
    expect(calls.slice(-2)).toEqual(['maint:stop', 'startApi']);
  });
});
