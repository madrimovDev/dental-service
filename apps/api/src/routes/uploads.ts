import { sep } from 'node:path';
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
 *
 * Tenant-scoping (CLI-405): tekshiruv KANONIK (normalizatsiya qilingan) yo'l
 * ustida bajariladi. Avval `storage.resolve(key)` `..`ni collapse qilib
 * `baseDir`-nisbiy `relKey`ni qaytaradi (escape'da `null`); tenant segmenti
 * aynan shu `relKey`dan olinadi — ya'ni tekshirilgan-string = o'qiladigan-string.
 * (Eski xatolik: tekshiruv xom `key.split('/')[1]`da, o'qish `..`-collapsed
 * yo'lda edi → `tenants/T1/../T2/...` T1-gate'dan o'tib T2 fayliga yechilardi.)
 */
export const uploadsRoutes = (storage: StorageAdapter) => {
  const app = new Hono();

  app.use('*', authMiddleware());

  app.get('/:key{.+}', async (c) => {
    const key = c.req.param('key');
    const activeTenantId = c.get('activeTenantId');

    // Kanonik yechim — `..`/absolute yo'l `baseDir` tashqarisiga chiqsa `null`.
    const resolved = storage.resolve(key);
    if (!resolved) {
      return c.json(fail('NOT_FOUND', 'File not found'), 404);
    }

    // Tenant-scoping (CLI-359/CLI-405): key formati doim `tenants/{tenantId}/...`
    // (yagona producer — `patientImageKey()`, lib/s3.ts). Bu route filesystem
    // asosida ishlaydi (RLS qamrovidan tashqarida), shuning uchun tenant
    // mosligini KANONIK relKey'dan (o'qiladigan yo'l bilan bir xil string)
    // tekshiramiz. Mismatch bo'lsa 404 (403 emas) — "file not found" bilan bir
    // xil javob, fayl mavjudligini boshqa tenantga oshkor qilmaslik uchun.
    const [prefix, keyTenantId] = resolved.relKey.split(sep);
    if (prefix !== 'tenants' || !keyTenantId || keyTenantId !== activeTenantId) {
      return c.json(fail('NOT_FOUND', 'File not found'), 404);
    }

    if (!(await storage.exists(key))) {
      return c.json(fail('NOT_FOUND', 'File not found'), 404);
    }

    // Bun.file(...).type extension asosida aniqlanadi (fayl mavjudligidan
    // qat'i nazar) — kanonik `resolved.path`dan to'g'ri Content-Type olish uchun.
    const contentType = Bun.file(resolved.path).type || 'application/octet-stream';
    return new Response(storage.stream(key), {
      headers: { 'Content-Type': contentType },
    });
  });

  return app;
};
