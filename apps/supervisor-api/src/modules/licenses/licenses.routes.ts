import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { adminJwtMiddleware } from '../auth/jwt.middleware';
import { createLicenseService } from './licenses.service';

const activateSchema = z.object({
  licenseKey: z.string().min(1),
  fingerprint: z.string().min(1),
});

export const licensesRoutes = () => {
  const app = new Hono();
  const service = createLicenseService();

  app.post('/activate', zValidator('json', activateSchema), async (c) => {
    try {
      const { licenseKey, fingerprint } = c.req.valid('json');
      const data = await service.activate(licenseKey, fingerprint);
      return c.json(data);
    } catch (e: any) {
      return c.json({ error: { code: e.message } }, e.status ?? 500);
    }
  });

  app.post('/heartbeat', zValidator('json', activateSchema), async (c) => {
    try {
      const { licenseKey, fingerprint } = c.req.valid('json');
      const data = await service.heartbeat(licenseKey, fingerprint);
      return c.json(data);
    } catch (e: any) {
      return c.json({ error: { code: e.message } }, e.status ?? 500);
    }
  });

  // Admin JWT talab qiladi (login: POST /v1/admin/auth/login — Task 4)
  app.post('/reactivate', adminJwtMiddleware, zValidator('json', activateSchema), async (c) => {
    try {
      const { licenseKey, fingerprint } = c.req.valid('json');
      const data = await service.reactivate(licenseKey, fingerprint);
      return c.json(data);
    } catch (e: any) {
      return c.json({ error: { code: e.message } }, e.status ?? 500);
    }
  });

  return app;
};
