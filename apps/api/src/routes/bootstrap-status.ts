import { ok } from '@dental/core';
import { tenants } from '@dental/db-schema';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../db/client.ts';
import { readLicense as defaultReadLicense } from '../lib/license.ts';
import { apiResponseSchema } from '../lib/openapi.ts';

export const bootstrapStatusResponseSchema = z
  .object({ hasLicense: z.boolean(), hasTenant: z.boolean() })
  .openapi('BootstrapStatusResponse');

/**
 * `GET /api/bootstrap-status` — ilova ishlashga TAYYORMI (audit C1).
 *
 * Auth YO'Q, permission YO'Q: login sahifasidan OLDIN chaqiriladi
 * (`/registration-enabled` pretsedenti). `license-middleware.ts` WHITELIST'iga
 * ham qo'shilgan — aks holda `.lic` yo'q paytda `requireModule`
 * `LICENSE_NOT_FOUND` qaytarib, aynan aniqlamoqchi bo'lgan holatni yopib
 * qo'yardi.
 *
 * Nima uchun kerak: `.lic` bor, lekin lokal bazada tenant yo'q holat mavjud
 * (baza yo'qolgan / yangi kompyuter). Bunda desktop gate'i (fayl-mavjudligi)
 * asosiy UI'ni ochadi, login esa 401 beradi — foydalanuvchi sababni
 * bilmaydi. Bu endpoint ikkalasini ajratadi.
 *
 * `readLicense` injectable — test uchun (`.lic` faylsiz).
 */
export const bootstrapStatusRoutes = (deps: {
  db: Database;
  readLicense?: typeof defaultReadLicense;
}) => {
  const readLic = deps.readLicense ?? defaultReadLicense;
  const app = new OpenAPIHono();

  const route = createRoute({
    method: 'get',
    path: '/',
    tags: ['auth'],
    operationId: 'bootstrapStatus',
    responses: {
      200: {
        content: {
          'application/json': { schema: apiResponseSchema(bootstrapStatusResponseSchema) },
        },
        description: 'Whether the local install has a license and a provisioned tenant',
      },
    },
  });

  app.openapi(route, async (c) => {
    // `tenants` jadvalida RLS YO'Q (`scripts/check-rls-coverage.ts`
    // PLATFORM_TABLES) — pre-auth kontekstda ham o'qish mumkin. Faqat
    // MAVJUDLIK, hech qanday tafsilot qaytarilmaydi (pre-auth surface).
    const rows = await deps.db.select({ id: tenants.id }).from(tenants).limit(1);
    const lic = await readLic();

    return c.json(ok({ hasLicense: lic !== null, hasTenant: rows.length > 0 }), 200);
  });

  return app;
};
