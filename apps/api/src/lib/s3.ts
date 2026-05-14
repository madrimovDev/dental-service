import { S3Client } from 'bun';
import { env } from './env.ts';

/**
 * MinIO/S3 client — barcha patient images shu yerga yuklanadi.
 * Endpoint MinIO uchun custom; AWS S3 uchun ham ishlaydi (endpoint o'zgartirilsa).
 */
export const s3 = new S3Client({
  endpoint: env.MINIO_ENDPOINT,
  accessKeyId: env.MINIO_ROOT_USER,
  secretAccessKey: env.MINIO_ROOT_PASSWORD,
  bucket: env.MINIO_BUCKET,
  region: 'us-east-1', // MinIO default
  virtualHostedStyle: false, // path-style URLs uchun
});

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
 * Presigned download URL — short-lived (5 min).
 * Frontend `<img src>` ga shu URL beriladi.
 */
export async function presignedGetUrl(objectKey: string, expiresInSec = 300): Promise<string> {
  const file = s3.file(objectKey);
  return file.presign({ expiresIn: expiresInSec, method: 'GET' });
}

/**
 * Upload buffer to MinIO. Returns object key.
 */
export async function uploadObject(args: {
  key: string;
  body: ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<void> {
  const file = s3.file(args.key);
  await file.write(args.body, { type: args.contentType });
}

export async function deleteObject(key: string): Promise<void> {
  await s3.delete(key);
}
