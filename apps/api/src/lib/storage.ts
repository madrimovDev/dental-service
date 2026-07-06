import { mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

/**
 * Local desktop deploy uchun MinIO/S3 o'rniga filesystem-backed storage.
 * `baseDir` — Windows'da `C:\ProgramData\DentalService\uploads`,
 * Linux'da `/var/lib/dental-service/uploads` (portable Postgres/Valkey bilan bir qatorda).
 */
const DEFAULT_DIR =
  process.platform === 'win32'
    ? 'C:\\ProgramData\\DentalService\\uploads'
    : '/var/lib/dental-service/uploads';

export interface StorageAdapter {
  save(key: string, data: Buffer): Promise<void>;
  stream(key: string): ReadableStream;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  serveUrl(key: string): string;
  /**
   * `key`ni kanonik (normalizatsiya QILINGAN) `baseDir`-nisbiy yo'lга yechadi.
   * `baseDir` tashqarisiga chiqsa (path traversal — `..`, absolute yo'l) `null`
   * qaytaradi (throw EMAS). Tenant-tekshiruvi aynan shu `relKey` (o'qiladigan
   * string) ustida bajarilishi uchun — CLI-405: tekshirilgan-string ≡ o'qilgan-string.
   */
  resolve(key: string): { path: string; relKey: string } | null;
}

/**
 * `key` GET /uploads/:key route orqali to'g'ridan-to'g'ri foydalanuvchi
 * kiritgan qiymatdan keladi (patient-image URL ni tahmin qilib boshqa
 * yo'l ham yuborilishi mumkin). Oddiy `join(baseDir, key)` `..`
 * segmentlarini hal qilib `baseDir` tashqarisiga chiqib ketadi (path
 * traversal — masalan `../../../etc/passwd` yoki `.env`/`license.lic`ni
 * o'qish). Shu sababli har doim natija `baseDir` ichida qolishini
 * tekshiramiz.
 */
function resolveSafePath(baseDir: string, key: string): string {
  const resolvedBase = resolve(baseDir);
  const resolvedPath = resolve(resolvedBase, key);
  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(resolvedBase + sep)) {
    throw new Error(`Invalid storage key (path traversal blocked): ${key}`);
  }
  return resolvedPath;
}

export const createLocalStorageAdapter = (
  baseDir: string = process.env.UPLOADS_DIR ?? DEFAULT_DIR,
): StorageAdapter => ({
  async save(key, data) {
    const path = resolveSafePath(baseDir, key);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, data);
  },
  stream(key) {
    return Bun.file(resolveSafePath(baseDir, key)).stream();
  },
  async remove(key) {
    await unlink(resolveSafePath(baseDir, key));
  },
  async exists(key) {
    try {
      await stat(resolveSafePath(baseDir, key));
      return true;
    } catch {
      return false;
    }
  },
  serveUrl(key) {
    return `/uploads/${encodeURIComponent(key)}`;
  },
  resolve(key) {
    const resolvedBase = resolve(baseDir);
    const resolvedPath = resolve(resolvedBase, key);
    if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(resolvedBase + sep)) {
      return null;
    }
    return { path: resolvedPath, relKey: relative(resolvedBase, resolvedPath) };
  },
});
