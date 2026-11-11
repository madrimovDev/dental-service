import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { normalizePhone } from '../../lib/phone';
import { adminJwtMiddleware } from '../auth/jwt.middleware';
import { hubToken } from '../hub/hub-token';

/**
 * Supervisor admin «Laboratoriyalar» (L6: lablarni faqat vendor yaratadi,
 * L10: obuna = faqat muddat). Manba — Lab Hub; bu yerda faqat ichki API
 * proksisi (`LAB_HUB_URL` + `SUPERVISOR_HUB_TOKEN`). Lead vaqtinchalik paroli
 * Supervisor'da SAQLANMAYDI — yaratish javobida bir marta ko'rsatiladi.
 */
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Sana kun oxirigacha amal qiladi (UTC).
const endOfDay = (d: string) => `${d}T23:59:59.000Z`;

const createLabSchema = z.object({
  name: z.string().trim().min(2).max(200),
  city: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
  catalogVisible: z.boolean().optional(),
  expiresAt: dateOnly,
  leadFullName: z.string().trim().min(2).max(200),
  leadPhone: z.string().trim().min(9).max(20),
});

const patchLabSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  city: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  catalogVisible: z.boolean().optional(),
  expiresAt: dateOnly.optional(),
});

export const labsRoutes = (deps: { fetch?: typeof fetch } = {}) => {
  const app = new Hono();
  app.use('*', adminJwtMiddleware);

  const hub = async (path: string, init: { method: string; body?: unknown }) => {
    const base = process.env.LAB_HUB_URL;
    const token = hubToken();
    if (!base || !token)
      return { status: 503, body: { error: { code: 'LAB_HUB_NOT_CONFIGURED' } } };
    try {
      const res = await (deps.fetch ?? fetch)(new URL(path, base).toString(), {
        method: init.method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await res.json().catch(() => ({ error: { code: 'LAB_HUB_BAD_RESPONSE' } }));
      return { status: res.status, body };
    } catch {
      return { status: 502, body: { error: { code: 'LAB_HUB_UNREACHABLE' } } };
    }
  };
  // biome-ignore lint/suspicious/noExplicitAny: Hub javobi shaffof uzatiladi
  const send = (c: any, r: { status: number; body: unknown }) => c.json(r.body, r.status);

  app.get('/', async (c) => send(c, await hub('/internal/labs', { method: 'GET' })));

  app.post('/', zValidator('json', createLabSchema), async (c) => {
    const b = c.req.valid('json');
    return send(
      c,
      await hub('/internal/labs', {
        method: 'POST',
        body: { ...b, leadPhone: normalizePhone(b.leadPhone), expiresAt: endOfDay(b.expiresAt) },
      }),
    );
  });

  app.patch('/:id', zValidator('json', patchLabSchema), async (c) => {
    const id = c.req.param('id');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const b = c.req.valid('json');
    return send(
      c,
      await hub(`/internal/labs/${id}`, {
        method: 'PATCH',
        body: { ...b, ...(b.expiresAt ? { expiresAt: endOfDay(b.expiresAt) } : {}) },
      }),
    );
  });

  return app;
};
