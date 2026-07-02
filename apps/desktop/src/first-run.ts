/**
 * Birinchi ishga tushirish (first-run) — portable Postgres uchun initdb,
 * ma'lumot papkalarini yaratish va konfiguratsiya fayllarini joylashtirish
 * (CLI-346, Task 7).
 */

import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';

const getResourcesDir = (): string =>
  app.isPackaged ? process.resourcesPath : join(import.meta.dirname, '../../resources');

const getDataDir = (): string =>
  process.env.DENTAL_DATA_DIR ||
  (process.platform === 'win32' ? 'C:\\ProgramData\\DentalService' : '/var/lib/dental-service');

const getPgDataDir = (): string => join(getDataDir(), 'postgres', 'data');

export const isFirstRun = (): boolean => !existsSync(join(getPgDataDir(), 'PG_VERSION'));

const assertSuccess = (result: SpawnSyncReturns<Buffer>, label: string): void => {
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${result.stderr?.toString() ?? 'unknown error'}`);
  }
};

export const runFirstSetup = (): void => {
  const dataDir = getDataDir();
  const pgData = getPgDataDir();
  const resourcesDir = getResourcesDir();
  const pgBin = join(resourcesDir, 'postgres', 'bin');

  // 1. Ma'lumotlar papkalarini yaratish
  mkdirSync(join(dataDir, 'uploads'), { recursive: true });
  mkdirSync(join(dataDir, 'logs'), { recursive: true });
  mkdirSync(pgData, { recursive: true });

  // 2. initdb — postgres data dir yaratish
  const initdb = spawnSync(
    join(pgBin, 'initdb.exe'),
    ['-D', pgData, '--encoding=UTF8', '--locale=C', '-U', 'dental'],
    { stdio: 'pipe' },
  );
  assertSuccess(initdb, 'initdb');

  // 3. postgres.conf / valkey.conf nusxalash
  copyFileSync(
    join(resourcesDir, '..', 'infra', 'postgres-win.conf'),
    join(dataDir, 'postgres.conf'),
  );
  copyFileSync(join(resourcesDir, '..', 'infra', 'valkey-win.conf'), join(dataDir, 'valkey.conf'));
};

export const runMigrations = (apiExePath: string): void => {
  const dataDir = getDataDir();
  // api.exe ni migration rejimida ishga tushirish
  const result = spawnSync(apiExePath, ['migrate'], {
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://dental:dental@localhost:5433/dental',
      DATABASE_ADMIN_URL: 'postgresql://dental:dental@localhost:5433/dental',
      UPLOADS_DIR: join(dataDir, 'uploads'),
      RUN_MIGRATIONS: 'true',
    },
    stdio: 'pipe',
  });
  assertSuccess(result, 'Migrations');
};
