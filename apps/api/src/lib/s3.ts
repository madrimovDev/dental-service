import { createLocalStorageAdapter } from './storage.ts';

/**
 * Local Desktop (CLI-340): MinIO/S3 endi ishlatilmaydi — offline LAN
 * deploy'da tashqi S3 mavjud emas. Bu modul endi `storage.ts` (local
 * filesystem adapter) ga delegatsiya qiladi; public funksiya signaturalari
 * o'zgarmadi, shuning uchun chaqiruvchi modullar (masalan
 * `patient-images.service.ts`) o'zgarishsiz qoladi.
 */
const storage = createLocalStorageAdapter();

/**
 * Storage key generator — multi-tenant uchun:
 *   tenants/{tenantId}/patients/{patientId}/{imageId}.{ext}
 */
export function patientImageKey(args: {
  tenantId: string;
  patientId: string;
  imageId: string;
  ext: string;
}): string {
  const ext = args.ext.replace(/^\./, '').toLowerCase();
  return `tenants/${args.tenantId}/patients/${args.patientId}/${args.imageId}.${ext}`;
}

/**
 * Fayl URL — avval MinIO presigned (short-lived) URL edi, endi local
 * filesystem'dagi `/uploads/:key` route'ga relative path
 * (`storage.serveUrl`). Frontend `<img src>` shu path'ni to'g'ridan ishlatadi.
 * `expiresInSec` endi ma'nosiz (local fayl uchun muddat yo'q) — signature
 * chaqiruvchi kodni o'zgartirmaslik uchun saqlanadi.
 */
export async function presignedGetUrl(objectKey: string, _expiresInSec = 300): Promise<string> {
  return storage.serveUrl(objectKey);
}

/**
 * Buffer'ni local filesystem'ga yozadi. Returns object key.
 */
export async function uploadObject(args: {
  key: string;
  body: ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<void> {
  const data =
    args.body instanceof Uint8Array
      ? Buffer.from(args.body)
      : Buffer.from(new Uint8Array(args.body));
  await storage.save(args.key, data);
}

export async function deleteObject(key: string): Promise<void> {
  await storage.remove(key);
}
