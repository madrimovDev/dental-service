import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { adminJwtMiddleware } from '../auth/jwt.middleware';
import { createLicenseService } from './licenses.service';

const activateSchema = z.object({
  licenseKey: z.string().min(1),
  fingerprint: z.string().min(1),
});

const verifyResetSchema = z.object({
  licenseKey: z.string().min(1),
  fingerprint: z.string().min(1),
  resetToken: z.string().min(1),
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

  // CLI-226 — desktop (online, pre-auth) vendor-berilgan owner parol-tiklash
  // tokenini tekshiradi + bir martalik consume qiladi. Public — activate'ga
  // o'xshab hech qanday admin/user auth talab qilmaydi.
  app.post('/verify-reset', zValidator('json', verifyResetSchema), async (c) => {
    const { licenseKey, fingerprint, resetToken } = c.req.valid('json');
    const data = await service.verifyReset(licenseKey, fingerprint, resetToken);
    return c.json(data, data.ok ? 200 : 400);
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

  // CLI-226 — vendor admin panelidan bir martalik owner parol-tiklash tokeni
  // yaratadi (litsenziya ID bo'yicha, admin JWT talab qiladi).
  app.post('/:id/reset-token', adminJwtMiddleware, async (c) => {
    const id = c.req.param('id');
    try {
      const data = await service.createResetToken(id);
      return c.json({ resetToken: data.resetToken, expiresAt: data.expiresAt });
    } catch (e: any) {
      return c.json({ error: { code: e.message } }, e.status ?? 400);
    }
  });

  return app;
};
