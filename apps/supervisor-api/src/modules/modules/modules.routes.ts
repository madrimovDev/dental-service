import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db/client';
import { licenses } from '../../db/schema';
import { adminJwtMiddleware } from '../auth/jwt.middleware';

const updateModulesSchema = z.object({
  modules: z.array(z.string()),
  // 1..365 — `createClinicSchema` (clinics.routes.ts) bilan AYNI chegara.
  // Grace period muddat tekshiruviga to'g'ridan-to'g'ri qo'shiladi (apps/api
  // `isLicenseValid`: `hozir < expiresAt + gracePeriodDays`), shuning uchun
  // chegarasiz qiymat litsenziyani amalda cheksiz uzaytirardi va yaratishdagi
  // cheklov shu bitta endpoint orqali chetlab o'tilardi.
  gracePeriodDays: z.number().int().min(1).max(365).optional(),
});

export const modulesRoutes = () => {
  const app = new Hono();
  app.use('*', adminJwtMiddleware);

  // Modul ro'yxatini yangilash (keyingi heartbeat'da klientga yetadi)
  app.patch('/licenses/:key/modules', zValidator('json', updateModulesSchema), async (c) => {
    const key = c.req.param('key');
    const { modules, gracePeriodDays } = c.req.valid('json');
    const update: { modules: string[]; gracePeriodDays?: number } = { modules };
    if (gracePeriodDays !== undefined) update.gracePeriodDays = gracePeriodDays;
    const updated = await db
      .update(licenses)
      .set(update)
      .where(eq(licenses.licenseKey, key))
      .returning({ id: licenses.id });
    if (updated.length === 0) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    return c.json({ ok: true });
  });

  return app;
};
