import { mkdir, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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
}

export const createLocalStorageAdapter = (
  baseDir: string = process.env.UPLOADS_DIR ?? DEFAULT_DIR,
): StorageAdapter => ({
  async save(key, data) {
    const path = join(baseDir, key);
    await mkdir(dirname(path), { recursive: true });
    await Bun.write(path, data);
  },
  stream(key) {
    return Bun.file(join(baseDir, key)).stream();
  },
  async remove(key) {
    await unlink(join(baseDir, key));
  },
  async exists(key) {
    try {
      await stat(join(baseDir, key));
      return true;
    } catch {
      return false;
    }
  },
  serveUrl(key) {
    return `/uploads/${encodeURIComponent(key)}`;
  },
});
