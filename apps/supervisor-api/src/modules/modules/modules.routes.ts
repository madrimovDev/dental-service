import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { db } from '../../db/client';
import { licenses } from '../../db/schema';
import { adminJwtMiddleware } from '../auth/jwt.middleware';

const updateModulesSchema = z.object({
  modules: z.array(z.string()),
  gracePeriodDays: z.number().int().optional(),
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
    await db.update(licenses).set(update).where(eq(licenses.licenseKey, key));
    return c.json({ ok: true });
  });

  return app;
};
