import { fail } from '@dental/core';
import { Hono } from 'hono';
import type { StorageAdapter } from '../lib/storage.ts';
import { authMiddleware } from '../middleware/auth.ts';

/**
 * `GET /uploads/:key` — auth required, local filesystem storage'dan fayl
 * qaytaradi (MinIO presigned URL o'rniga — Local Desktop offline rejimida
 * tashqi S3 mavjud emas).
 *
 * `serveUrl()` (storage.ts) `encodeURIComponent` bilan `/` ni ham kodlaydi
 * (masalan `tenants/x/patients/y/z.jpg` → `tenants%2Fx%2F...`), shuning uchun
 * bu yerda ham to'liq encoded segmentni bitta `:key{.+}` param sifatida olib
 * `decodeURIComponent` bilan asl key'ga qaytaramiz.
 */
export const uploadsRoutes = (storage: StorageAdapter) => {
  const app = new Hono();

  app.use('*', authMiddleware());

  app.get('/:key{.+}', async (c) => {
    const key = decodeURIComponent(c.req.param('key'));

    if (!(await storage.exists(key))) {
      return c.json(fail('NOT_FOUND', 'File not found'), 404);
    }

    // Bun.file(...).type extension asosida aniqlanadi (fayl mavjudligidan
    // qat'i nazar) — storage adapter'ning `baseDir`ini bu yerga chiqarmasdan
    // to'g'ri Content-Type olish uchun.
    const contentType = Bun.file(key).type || 'application/octet-stream';
    return new Response(storage.stream(key), {
      headers: { 'Content-Type': contentType },
    });
  });

  return app;
};
