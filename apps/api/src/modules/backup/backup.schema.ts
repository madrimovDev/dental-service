import { z } from '@hono/zod-openapi';

/**
 * Zaxira nusxa (UI-3 / D.1) — API <-> Electron main fayl-kontrakti.
 *
 * ⚠️ Bu nomlar `apps/desktop/src/backup-scheduler.ts` bilan BIR XIL bo'lishi shart
 * (ikki nusxa — kross-paket import yo'q). O'zgartirsangiz ikkalasini yangilang.
 */
export const BACKUP_NAME_RE = /^dental-\d{8}-\d{6}$/;
export const BACKUP_DB_FILE = 'db.dump';
export const BACKUP_SETTINGS_FILE = 'backup-settings.json';
export const BACKUP_STATE_FILE = 'backup-state.json';
export const BACKUP_REQUEST_FILE = 'backup-request.json';
export const RESTORE_REQUEST_FILE = 'restore-request.json';
/** FX-147: Electron main tiklash natijasini shu faylga yozadi (`writeRestoreResult`). */
export const RESTORE_RESULT_FILE = 'restore-result.json';

export const backupFileSchema = z
  .object({
    name: z.string().openapi({ example: 'dental-20261111-200000' }),
    sizeBytes: z.number().int().nonnegative(),
    createdAt: z.string().openapi({ example: '2026-11-11T20:00:00.000Z' }),
  })
  .openapi('BackupFile');

/**
 * FX-147: oxirgi tiklash natijasi (`restore-result.json`). `lastError`dan ALOHIDA — u faqat
 * zaxira olish holati. `running` — tiklash hozir bajarilmoqda (finishedAt = boshlangan vaqt).
 */
export const backupRestoreResultSchema = z
  .object({
    status: z.enum(['running', 'ok', 'failed']),
    file: z.string().nullable(),
    finishedAt: z.string().nullable(),
    error: z.string().nullable(),
    /** `failed`da: baza tiklashdan oldingi nusxaga qaytarildimi (null — baza tegilmagan). */
    dbRolledBack: z.boolean().nullable(),
  })
  .openapi('BackupRestoreResult');
export type BackupRestoreResultDto = z.infer<typeof backupRestoreResultSchema>;

export const backupStatusSchema = z
  .object({
    mode: z.enum(['desktop', 'cloud']),
    folder: z.string().nullable(),
    lastSuccessAt: z.string().nullable(),
    lastError: z.string().nullable(),
    files: z.array(backupFileSchema),
    lastRestore: backupRestoreResultSchema.nullable(),
  })
  .openapi('BackupStatus');
export type BackupStatusDto = z.infer<typeof backupStatusSchema>;

export const backupRequestedSchema = z
  .object({ requested: z.literal(true) })
  .openapi('BackupRequested');

export const backupSettingsInputSchema = z.object({
  folder: z.string().trim().min(1).max(500),
});
export type BackupSettingsInput = z.infer<typeof backupSettingsInputSchema>;

export const backupSettingsSchema = z.object({ folder: z.string() }).openapi('BackupSettings');

export const restoreBackupInputSchema = z.object({
  file: z.string().min(1).max(200),
  confirmName: z.string().min(1).max(200),
});
export type RestoreBackupInput = z.infer<typeof restoreBackupInputSchema>;
