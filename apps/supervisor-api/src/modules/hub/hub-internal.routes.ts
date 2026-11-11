import { Hono } from 'hono';
import { loadClinicHubState } from './clinic-state';
import { hubToken, tokenMatches } from './hub-token';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Hub → Supervisor ichki API (`/internal/clinics/*`, `Authorization: Bearer
 * SUPERVISOR_HUB_TOKEN`). Caddy uni tashqariga ochmaydi (infra/supervisor).
 *
 * `GET /internal/clinics/:id/verify?licenseKey=` — klinika rejimi, faolmi, obuna
 * muddati, desktop litsenziya kaliti mosmi (kalitning o'zi javobda qaytmaydi).
 * `desktop` — litsenziyalar bo'yicha; `saas` — `subscription_expires_at`
 * (`licenseMatches` doim false — SaaS connect `serviceProof` bilan).
 *
 * ⚠️ Middleware FAQAT `/clinics/*` ga: bu router `/internal`ga mount qilingan va
 * `app.use('*')` qo'shni `/internal/saas/*` (o'z tokeni bilan) yo'lini ham
 * ushlab, uni 503/401 qilardi.
 */
export const hubInternalRoutes = () => {
  const app = new Hono();

  app.use('/clinics/*', async (c, next) => {
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
    const state = await loadClinicHubState(id);
    if (!state) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const key = c.req.query('licenseKey');
    return c.json({
      clinicId: state.clinicId,
      name: state.name,
      mode: state.mode,
      active: state.active,
      expiresAt: state.expiresAt?.toISOString() ?? null,
      licenseMatches:
        state.mode === 'desktop' &&
        !!key &&
        state.activeLicenseKeys.some((k) => tokenMatches(key, k)),
    });
  });

  return app;
};
