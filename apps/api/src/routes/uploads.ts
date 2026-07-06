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
 * bu yerda to'liq encoded segment bitta `:key{.+}` param sifatida keladi.
 * Hono `c.req.param()` route paramlarni AVTOMATIK bir marta decode qiladi —
 * shu sababli bu yerda QAYTA `decodeURIComponent` chaqirilMAYDI: agar
 * chaqirilsa, decode qilingan key literal `%` belgi bilan tugasa (masalan
 * fayl nomi `50%off.jpg`) `URIError: URI malformed` bilan crash qiladi
 * (isbotlangan: bir martalik decode aynan asl key'ni qaytaradi).
 * Path-traversal himoyasi (`../etc/passwd`) `storage.ts`ning
 * `resolveSafePath` ichida — bu yerda qo'shimcha tekshiruv shart emas.
 */
export const uploadsRoutes = (storage: StorageAdapter) => {
  const app = new Hono();

  app.use('*', authMiddleware());

  app.get('/:key{.+}', async (c) => {
    const key = c.req.param('key');
    const activeTenantId = c.get('activeTenantId');

    // Tenant-scoping (CLI-359): key formati doim `tenants/{tenantId}/...`
    // (yagona producer — `patientImageKey()`, lib/s3.ts). Bu route filesystem
    // asosida ishlaydi (RLS qamrovidan tashqarida), shuning uchun tenant
    // mosligini bu yerda qo'lda tekshiramiz. Mismatch bo'lsa 404 (403 emas) —
    // "file not found" bilan bir xil javob, fayl mavjudligini boshqa
    // tenantga oshkor qilmaslik uchun (enumeration'dan himoya).
    const [prefix, keyTenantId] = key.split('/');
    if (prefix !== 'tenants' || !keyTenantId || keyTenantId !== activeTenantId) {
      return c.json(fail('NOT_FOUND', 'File not found'), 404);
    }

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
