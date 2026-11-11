import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from '../../db/client';
import { clinics, licenses } from '../../db/schema';
import { hubToken, tokenMatches } from './hub-token';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hub → Supervisor ichki API (`/internal/*`, `Authorization: Bearer
 * SUPERVISOR_HUB_TOKEN`). Caddy uni tashqariga ochmaydi (infra/supervisor).
 *
 * `GET /internal/clinics/:id/verify?licenseKey=` — klinika faolmi, obuna muddati,
 * desktop litsenziya kaliti mosmi. Kalitning o'zi javobda qaytmaydi.
 * ⚠️ Hozircha faqat desktop (litsenziya) klinikalari; SaaS rejimi (`clinics.mode`,
 * L8 — saas-sv lane) qo'shilganda `mode`/`subscription_expires_at` shu yerda o'qiladi.
 */
export const hubInternalRoutes = () => {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const expected = hubToken();
    if (!expected) return c.json({ error: { code: 'HUB_NOT_CONFIGURED' } }, 503);
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ') || !tokenMatches(auth.slice(7), expected)) {
      return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
    }
    await next();
  });

  app.get('/clinics/:id/verify', async (c) => {
    const id = c.req.param('id');
    if (!UUID_RE.test(id)) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const clinic = await db.query.clinics.findFirst({ where: eq(clinics.id, id) });
    if (!clinic) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const rows = await db.select().from(licenses).where(eq(licenses.clinicId, id));
    const activeRows = rows.filter((l) => l.isActive);
    const key = c.req.query('licenseKey');
    const latest = activeRows.reduce<Date | null>(
      (max, l) => (!max || l.expiresAt > max ? l.expiresAt : max),
      null,
    );
    return c.json({
      clinicId: clinic.id,
      name: clinic.name,
      mode: 'desktop' as const,
      active: activeRows.length > 0,
      expiresAt: latest?.toISOString() ?? null,
      licenseMatches: !!key && activeRows.some((l) => tokenMatches(key, l.licenseKey)),
    });
  });

  return app;
};
