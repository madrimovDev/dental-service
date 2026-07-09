import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { rateLimit } from '../../lib/rate-limit';
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

type LicenseService = ReturnType<typeof createLicenseService>;

export const licensesRoutes = (deps: { service?: LicenseService } = {}) => {
  const app = new Hono<{ Variables: { adminUserId?: string } }>();
  const service = deps.service ?? createLicenseService();

  // CLI-226 fix — public'dan reachable, brute-force-lanadigan reset-token
  // urinishlarini cheklaydi. auth.routes.ts'dagi loginRateLimit bilan bir xil
  // uslub/limit (10 urinish / 15 daqiqa). Kalitga `resetToken`ni QO'SHMAYMIZ —
  // u aynan taxmin qilinayotgan sir; har noto'g'ri urinishda boshqa token
  // sinalsa yangi bucket ochilib limit chetlab o'tiladi (reset-owner-password.ts
  // precedenti). `licenseKey` mijoz qo'lidagi non-secret identifikator —
  // IP + licenseKey bo'yicha cheklaydi.
  const verifyResetRateLimit = rateLimit({
    name: 'verify-reset',
    limit: 10,
    windowSeconds: 900,
    keyFromBody: (b) =>
      typeof b === 'object' &&
      b !== null &&
      typeof (b as { licenseKey?: unknown }).licenseKey === 'string'
        ? (b as { licenseKey: string }).licenseKey
        : undefined,
  });

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
  app.post(
    '/verify-reset',
    verifyResetRateLimit,
    zValidator('json', verifyResetSchema),
    async (c) => {
      try {
        const { licenseKey, fingerprint, resetToken } = c.req.valid('json');
        const data = await service.verifyReset(licenseKey, fingerprint, resetToken);
        return c.json(data, data.ok ? 200 : 400);
      } catch {
        // CLI-477 #1 — transient/DB xato Hono'ning default HTML 500'ini beradi;
        // desktop klient (license-client.ts) body'ni `res.json()` bilan o'qiydi,
        // HTML kelsa parse throw qiladi. activate/heartbeat/reactivate uslubida
        // izchil JSON qaytaramiz — `ok:false` (token-yaroqsizdan ajratish uchun
        // aniq `error:'server_error'` kodi bilan). Sirlar oshkor qilinmaydi.
        return c.json({ ok: false as const, error: 'server_error' }, 500);
      }
    },
  );

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
  // CLI-477 #3 — `/v1/admin/licenses/...` namespace ostida (boshqa admin license
  // op'lar — modules `/v1/admin/licenses/:key/modules` — bilan izchil); public
  // `/v1/:id/...` da EMAS (kelajakdagi `:id` catch-all to'qnashuvidan qochish).
  app.post('/admin/licenses/:id/reset-token', adminJwtMiddleware, async (c) => {
    const id = c.req.param('id');
    const adminUserId = c.get('adminUserId');
    try {
      const data = await service.createResetToken(id, adminUserId);
      return c.json({ resetToken: data.resetToken, expiresAt: data.expiresAt });
    } catch (e: any) {
      return c.json({ error: { code: e.message } }, e.status ?? 400);
    }
  });

  return app;
};
