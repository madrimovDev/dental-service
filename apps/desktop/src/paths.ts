/**
 * Desktop ma'lumot/resurs yo'llari — yagona manba (P2). Ilgari `first-run.ts`
 * va `process-manager.ts`da takror `const`lar bor edi.
 *
 * Chaqiruv-vaqtida hisoblanadi (env-override testable bo'lishi uchun).
 */
import { join } from 'node:path';
import { app } from 'electron';

export const getResourcesDir = (): string =>
  app.isPackaged ? process.resourcesPath : join(import.meta.dirname, '..', 'resources');

export const getDataDir = (): string =>
  process.env.DENTAL_DATA_DIR ||
  (process.platform === 'win32' ? 'C:\\ProgramData\\DentalService' : '/var/lib/dental-service');

export const getPgDataDir = (): string => join(getDataDir(), 'postgres', 'data');

export const getBackupsDir = (): string => join(getDataDir(), 'backups');
