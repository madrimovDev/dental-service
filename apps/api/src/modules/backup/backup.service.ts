import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { tenants } from '@dental/db-schema';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import {
  BACKUP_DB_FILE,
  BACKUP_NAME_RE,
  BACKUP_REQUEST_FILE,
  BACKUP_SETTINGS_FILE,
  BACKUP_STATE_FILE,
  type BackupStatusDto,
  RESTORE_REQUEST_FILE,
} from './backup.schema.ts';

export type BackupFailure =
  | 'backup.not_available'
  | 'backup.owner_only'
  | 'backup.confirm_mismatch'
  | 'backup.file_invalid'
  | 'backup.folder_invalid'
  | 'backup.restore_pending';

export type BackupResult<T> = { ok: true; value: T } | { ok: false; code: BackupFailure };

export type BackupServiceDeps = {
  audit: AuditLogger;
  /** Faqat Local Desktop'da (Electron main bilan birga) zaxira mavjud. */
  isDesktop?: () => boolean;
  /** Desktop ma'lumot papkasi (`DENTAL_DATA_DIR` yoki platforma default). */
  getDataDir?: () => string;
  platform?: NodeJS.Platform;
  /** Windows'da `D:\` mavjudligini tekshirish (default papka tanlovi). */
  driveExists?: (root: string) => boolean;
};

const defaultDataDir = (): string =>
  process.env.DENTAL_DATA_DIR ||
  (process.platform === 'win32' ? 'C:\\ProgramData\\DentalService' : '/var/lib/dental-service');

const readJson = <T>(path: string): Partial<T> => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Partial<T>) : {};
  } catch {
    return {};
  }
};

const dirSize = (dir: string): number => {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isFile()) total += statSync(p).size;
    else if (entry.isDirectory()) total += dirSize(p);
  }
  return total;
};

export const createBackupService = (deps: BackupServiceDeps) => {
  const isDesktop = deps.isDesktop ?? (() => process.env.DENTAL_LOCAL_DESKTOP === 'true');
  const getDataDir = deps.getDataDir ?? defaultDataDir;
  const platform = deps.platform ?? process.platform;
  const driveExists = deps.driveExists ?? ((root: string) => existsSync(root));
  const dataPath = (name: string): string => join(getDataDir(), name);

  /** Default papka: Windows D:\DentalBackup (D: yo'q bo'lsa C:\), Linux dev `<dataDir>/backups`. */
  const defaultFolder = (): string => {
    if (platform === 'win32') {
      return driveExists('D:\\') ? 'D:\\DentalBackup' : 'C:\\DentalBackup';
    }
    return join(getDataDir(), 'backups');
  };

  const getFolder = (): string => {
    const saved = readJson<{ folder: string }>(dataPath(BACKUP_SETTINGS_FILE)).folder;
    return typeof saved === 'string' && saved.trim() !== '' ? saved : defaultFolder();
  };

  const listFiles = (folder: string): BackupStatusDto['files'] => {
    if (!existsSync(folder)) return [];
    const files: BackupStatusDto['files'] = [];
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (!entry.isDirectory() || !BACKUP_NAME_RE.test(entry.name)) continue;
      const dir = join(folder, entry.name);
      if (!existsSync(join(dir, BACKUP_DB_FILE))) continue;
      files.push({
        name: entry.name,
        sizeBytes: dirSize(dir),
        createdAt: statSync(dir).mtime.toISOString(),
      });
    }
    // Eng yangisi birinchi (nom — vaqt tamg'asi, leksikografik tartib = xronologik).
    return files.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  };

  const status = (): BackupStatusDto => {
    if (!isDesktop()) {
      return { mode: 'cloud', folder: null, lastSuccessAt: null, lastError: null, files: [] };
    }
    const folder = getFolder();
    const state = readJson<{ lastSuccessAt: string | null; lastError: string | null }>(
      dataPath(BACKUP_STATE_FILE),
    );
    return {
      mode: 'desktop',
      folder,
      lastSuccessAt: typeof state.lastSuccessAt === 'string' ? state.lastSuccessAt : null,
      lastError: typeof state.lastError === 'string' ? state.lastError : null,
      files: listFiles(folder),
    };
  };

  /** Joriy tenant va chaqiruvchining egaligi (JWT `@owner` sentinel'iga EMAS — DB egasiga tayanadi). */
  const loadTenant = async (c: Context) => {
    const tenantId = c.get('activeTenantId');
    const userId = c.get('user')?.id;
    if (!tenantId || !userId) return null;
    const [tenant] = await getDb(c)
      .select({ id: tenants.id, name: tenants.name, ownerUserId: tenants.ownerUserId })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!tenant) return null;
    return { ...tenant, userId, isOwner: tenant.ownerUserId === userId };
  };

  const run = async (c: Context): Promise<BackupResult<{ requested: true }>> => {
    if (!isDesktop()) return { ok: false, code: 'backup.not_available' };
    const path = dataPath(BACKUP_REQUEST_FILE);
    // Allaqachon navbatda bo'lsa — qayta yozmaymiz (idempotent).
    if (!existsSync(path)) {
      mkdirSync(getDataDir(), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({ id: randomUUID(), requestedAt: new Date().toISOString() }),
      );
    }
    await deps.audit.record(c, {
      action: 'backup.run_requested',
      resourceType: 'backup',
      after: { folder: getFolder() },
    });
    return { ok: true, value: { requested: true } };
  };

  const setFolder = async (
    c: Context,
    folder: string,
  ): Promise<BackupResult<{ folder: string }>> => {
    if (!isDesktop()) return { ok: false, code: 'backup.not_available' };
    const tenant = await loadTenant(c);
    if (!tenant?.isOwner) return { ok: false, code: 'backup.owner_only' };
    // Papka mavjud katalog va yoziladigan bo'lishi shart.
    if (!isAbsolute(folder) && !/^[A-Za-z]:[\\/]/.test(folder) && !folder.startsWith('\\\\')) {
      return { ok: false, code: 'backup.folder_invalid' };
    }
    try {
      if (!statSync(folder).isDirectory()) return { ok: false, code: 'backup.folder_invalid' };
      const probe = join(folder, `.write-probe-${randomUUID()}`);
      writeFileSync(probe, '');
      rmSync(probe, { force: true });
    } catch {
      return { ok: false, code: 'backup.folder_invalid' };
    }
    const before = getFolder();
    mkdirSync(getDataDir(), { recursive: true });
    writeFileSync(dataPath(BACKUP_SETTINGS_FILE), JSON.stringify({ folder }));
    await deps.audit.record(c, {
      action: 'backup.folder_changed',
      resourceType: 'backup',
      before: { folder: before },
      after: { folder },
    });
    return { ok: true, value: { folder } };
  };

  const requestRestore = async (
    c: Context,
    input: { file: string; confirmName: string },
  ): Promise<BackupResult<{ requested: true }>> => {
    if (!isDesktop()) return { ok: false, code: 'backup.not_available' };
    const tenant = await loadTenant(c);
    if (!tenant?.isOwner) return { ok: false, code: 'backup.owner_only' };
    if (input.confirmName !== tenant.name) return { ok: false, code: 'backup.confirm_mismatch' };

    // Path traversal yo'q: faqat `dental-YYYYMMDD-HHMMSS` nomi (hech qanday ajratgich emas)
    // + natija yo'li zaxira papkasi ichida qolishi tekshiriladi.
    const folder = resolve(getFolder());
    const target = resolve(folder, input.file);
    if (
      !BACKUP_NAME_RE.test(input.file) ||
      !target.startsWith(folder + sep) ||
      !existsSync(join(target, BACKUP_DB_FILE))
    ) {
      return { ok: false, code: 'backup.file_invalid' };
    }
    if (existsSync(dataPath(RESTORE_REQUEST_FILE))) {
      return { ok: false, code: 'backup.restore_pending' };
    }

    mkdirSync(getDataDir(), { recursive: true });
    writeFileSync(
      dataPath(RESTORE_REQUEST_FILE),
      JSON.stringify({
        id: randomUUID(),
        file: input.file,
        requestedAt: new Date().toISOString(),
        requestedBy: tenant.userId,
      }),
    );
    await deps.audit.record(c, {
      action: 'backup.restore_requested',
      resourceType: 'backup',
      resourceId: null,
      after: { file: input.file },
    });
    return { ok: true, value: { requested: true } };
  };

  return { status, run, setFolder, requestRestore, getFolder };
};

export type BackupService = ReturnType<typeof createBackupService>;
