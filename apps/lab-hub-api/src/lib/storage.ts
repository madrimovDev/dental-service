import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

/**
 * Fayllar diskda FAQAT shifrlangan blob sifatida: `<UPLOADS_DIR>/<labId>/<uuid>.bin`.
 * Kalit ichki generatsiya qilinadi; tashqi kiritma yo'lga tushmaydi, baribir
 * traversal tekshiruvi bor.
 */
const KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.bin$/;

export const createStorage = (baseDir: string) => {
  const root = resolve(baseDir);
  const pathOf = (key: string) => {
    if (!KEY_RE.test(key)) throw new Error('storage.bad_key');
    const p = resolve(join(root, key));
    if (!p.startsWith(root + sep)) throw new Error('storage.bad_key');
    return p;
  };
  return {
    root,
    async put(labId: string, encrypted: Buffer): Promise<string> {
      const key = `${labId}/${crypto.randomUUID()}.bin`;
      const p = pathOf(key);
      await mkdir(join(root, labId), { recursive: true, mode: 0o700 });
      await writeFile(p, encrypted, { mode: 0o600 });
      return key;
    },
    get: (key: string) => readFile(pathOf(key)),
    remove: (key: string) => rm(pathOf(key), { force: true }),
    pathOf,
  };
};
export type Storage = ReturnType<typeof createStorage>;
