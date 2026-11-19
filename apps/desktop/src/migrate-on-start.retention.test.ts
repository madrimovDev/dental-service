/**
 * FX-91 — pre-migrate dump'lari retention'siz to'planardi: migratsiya qayta-qayta yiqilsa
 * (yoki har yangilanishda) har startda `backups/`ga yangi to'liq `pg_dump` qo'shilib, disk
 * to'lardi. Endi dump olingandan keyin eng yangi `PRE_MIGRATE_RETENTION` tasi saqlanadi;
 * shu startda olingan dump HECH QACHON o'chmaydi (soat orqaga ketgan bo'lsa ham).
 *
 * Real fayl-tizimi (spy emas): dump haqiqiy fayl yozadi, prune haqiqiy papkani tozalaydi.
 * Ishga tushirish: `cd apps/desktop && bun test src/migrate-on-start.retention.test.ts`
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

await import('./test-electron-mock.js');

const mod = await import('./migrate-on-start.js');
const { migrateOnStart } = mod;
const prunePreMigrateDumps = (
  mod as unknown as {
    prunePreMigrateDumps?: (dir: string, keep: string, retention?: number) => void;
  }
).prunePreMigrateDumps;
const PRE_MIGRATE_RETENTION = (mod as unknown as { PRE_MIGRATE_RETENTION?: number })
  .PRE_MIGRATE_RETENTION;

const seedOldDumps = (dir: string, count: number): string[] => {
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const name = `pre-migrate-0.9.${i}-2026010${i % 10}-000000.dump`;
    const p = join(dir, name);
    writeFileSync(p, 'PGDMP-old');
    // Kelajak mtime'lari — yangi dump (soat orqaga ketgan) eng eski ko'rinadi.
    const t = new Date(Date.UTC(2030, 0, 1 + i));
    utimesSync(p, t, t);
    names.push(name);
  }
  return names;
};

describe('FX-91: pre-migrate dump retention', () => {
  test('har startda dump + yiqilgan migratsiya → papkada eng ko‘p PRE_MIGRATE_RETENTION ta dump, yangisi saqlanadi', () => {
    expect(typeof prunePreMigrateDumps).toBe('function');
    expect(typeof PRE_MIGRATE_RETENTION).toBe('number');
    const retention = PRE_MIGRATE_RETENTION as number;
    const dir = mkdtempSync(join(tmpdir(), 'fx91-backups-'));
    try {
      const old = seedOldDumps(dir, retention + 4);
      // Begona fayllar/papkalar (kunlik zaxira papkalari, foydalanuvchi fayli) tegilmaydi.
      mkdirSync(join(dir, 'dental-20261110-200000'));
      mkdirSync(join(dir, 'pre-migrate-0.1.1-x'));
      writeFileSync(join(dir, 'notes.txt'), 'x');

      let created = '';
      const r = migrateOnStart({
        runMigrations: () => {
          throw new Error('migration failed');
        },
        dump: (file: string) => {
          writeFileSync(file, 'PGDMP-new');
          created = file;
        },
        restore: () => {},
        readState: () => ({ lastMigratedVersion: '0.9.0' }),
        writeState: () => {},
        appVersion: '1.0.0',
        now: () => new Date(2026, 0, 1, 0, 0, 0),
        backupsDir: dir,
        pruneOldDumps: (keep: string) => prunePreMigrateDumps?.(dir, keep),
      } as Parameters<typeof migrateOnStart>[0]);

      expect(r.ok).toBe(false);
      const entries = readdirSync(dir);
      const dumps = entries.filter((n) => /^pre-migrate-.+\.dump$/.test(n));
      expect(dumps.length).toBe(retention);
      expect(created).not.toBe('');
      expect(dumps).toContain(created.split(/[\\/]/).pop() as string);
      // Qolganlari — eng yangi (mtime) eskilar.
      const newestOld = old.slice(-(retention - 1));
      for (const n of newestOld) expect(dumps).toContain(n);
      expect(entries).toContain('dental-20261110-200000');
      expect(entries).toContain('pre-migrate-0.1.1-x');
      expect(entries).toContain('notes.txt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('prune xatosi startni to‘xtatmaydi (best-effort)', () => {
    const r = migrateOnStart({
      runMigrations: () => {},
      dump: () => {},
      restore: () => {},
      readState: () => ({ lastMigratedVersion: '0.9.0' }),
      writeState: () => {},
      appVersion: '1.0.0',
      now: () => new Date(2026, 0, 1, 0, 0, 0),
      backupsDir: '/nonexistent-fx91',
      pruneOldDumps: () => {
        throw new Error('EACCES');
      },
    } as Parameters<typeof migrateOnStart>[0]);
    expect(r.ok).toBe(true);
  });
});
