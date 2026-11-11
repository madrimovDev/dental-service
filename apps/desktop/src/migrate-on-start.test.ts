import { describe, expect, mock, test } from 'bun:test';

await import('./test-electron-mock.js');

const { migrateOnStart } = await import('./migrate-on-start.js');

type Calls = string[];

const makeDeps = (
  opts: {
    last: string | null;
    version: string;
    migrateThrows?: string;
    restoreThrows?: boolean;
  },
  calls: Calls,
) => ({
  runMigrations: mock(() => {
    calls.push('migrate');
    if (opts.migrateThrows) throw new Error(opts.migrateThrows);
  }),
  dump: mock((file: string) => {
    calls.push(`dump:${file}`);
  }),
  restore: mock((file: string) => {
    calls.push(`restore:${file}`);
    if (opts.restoreThrows) throw new Error('pg_restore failed');
  }),
  readState: () => ({ lastMigratedVersion: opts.last }),
  writeState: mock((s: { lastMigratedVersion: string }) => {
    calls.push(`write:${s.lastMigratedVersion}`);
  }),
  appVersion: opts.version,
  now: () => new Date(2026, 10, 11, 9, 5, 7),
});

describe('migrateOnStart', () => {
  test('same version → no dump, migrate runs, ok', () => {
    const calls: Calls = [];
    const deps = makeDeps({ last: '1.2.0', version: '1.2.0' }, calls);
    const r = migrateOnStart(deps);
    expect(r).toEqual({ ok: true, backedUp: null });
    expect(deps.dump).not.toHaveBeenCalled();
    expect(deps.runMigrations).toHaveBeenCalledTimes(1);
  });

  test('new version → dump before migrate, state written', () => {
    const calls: Calls = [];
    const deps = makeDeps({ last: '1.2.0', version: '1.3.0' }, calls);
    const r = migrateOnStart(deps);
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatch(/^dump:.*backups.*pre-migrate-1\.3\.0-20261111-090507\.dump$/);
    expect(calls[1]).toBe('migrate');
    expect(calls[2]).toBe('write:1.3.0');
    expect(r.ok).toBe(true);
    expect(r.ok && r.backedUp).toMatch(/pre-migrate-1\.3\.0-20261111-090507\.dump$/);
  });

  test('restores dump and does not start api on failure', () => {
    const calls: Calls = [];
    const deps = makeDeps({ last: '1.2.0', version: '1.3.0', migrateThrows: 'boom' }, calls);
    const r = migrateOnStart(deps);
    const dumpFile = calls[0]?.replace('dump:', '');
    expect(calls[2]).toBe(`restore:${dumpFile}`);
    expect(deps.writeState).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, reason: 'failed', restored: true });
  });

  test('phone conflict detected', () => {
    const calls: Calls = [];
    const deps = makeDeps(
      {
        last: '1.2.0',
        version: '1.3.0',
        migrateThrows: "Migrations failed: Telefon normalizatsiyasi to'xtatildi — to'qnashuvlar",
      },
      calls,
    );
    const r = migrateOnStart(deps);
    expect(r).toMatchObject({ ok: false, reason: 'phone_conflict', restored: true });
  });

  test('restore failure reported', () => {
    const calls: Calls = [];
    const deps = makeDeps(
      { last: '1.2.0', version: '1.3.0', migrateThrows: 'boom', restoreThrows: true },
      calls,
    );
    const r = migrateOnStart(deps);
    expect(r).toMatchObject({ ok: false, reason: 'failed', restored: false });
    expect(!r.ok && r.backupFile).toMatch(/pre-migrate-1\.3\.0-/);
  });

  test('first run (state null) → no dump, state written', () => {
    const calls: Calls = [];
    const deps = makeDeps({ last: null, version: '1.0.0' }, calls);
    const r = migrateOnStart(deps);
    expect(deps.dump).not.toHaveBeenCalled();
    expect(calls).toEqual(['migrate', 'write:1.0.0']);
    expect(r).toEqual({ ok: true, backedUp: null });
  });

  test('dump failure → migration is not attempted', () => {
    const calls: Calls = [];
    const deps = makeDeps({ last: '1.2.0', version: '1.3.0' }, calls);
    deps.dump = mock(() => {
      throw new Error('disk full');
    });
    const r = migrateOnStart(deps);
    expect(deps.runMigrations).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: false, reason: 'failed' });
  });
});

describe('createStateStore (real fs)', () => {
  test('missing state: firstRun → null, existing install → unknown sentinel (forces dump); write/read roundtrip', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { existsSync, readFileSync } = await import('node:fs');
    const { createStateStore } = await import('./migrate-on-start.js');
    const dir = await mkdtemp(join(tmpdir(), 'dental-state-'));
    const prev = process.env.DENTAL_DATA_DIR;
    process.env.DENTAL_DATA_DIR = dir;
    try {
      expect(createStateStore(true).readState()).toEqual({ lastMigratedVersion: null });
      expect(createStateStore(false).readState()).toEqual({ lastMigratedVersion: 'unknown' });
      createStateStore(true).writeState({ lastMigratedVersion: '1.3.0' });
      expect(existsSync(join(dir, 'state.json'))).toBe(true);
      expect(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'))).toEqual({
        lastMigratedVersion: '1.3.0',
      });
      expect(createStateStore(false).readState()).toEqual({ lastMigratedVersion: '1.3.0' });
    } finally {
      if (prev === undefined) delete process.env.DENTAL_DATA_DIR;
      else process.env.DENTAL_DATA_DIR = prev;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
