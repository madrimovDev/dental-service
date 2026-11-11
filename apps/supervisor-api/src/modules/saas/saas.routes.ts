import crypto from 'node:crypto';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { db } from '../../db/client';
import { clinics } from '../../db/schema';
import { normalizePhone } from '../../lib/phone';

/**
 * L8 (Lab Hub) — SaaS tenantlar ham Supervisor'da klinika sifatida. Bu yerdagi
 * route'lar FAQAT SaaS `apps/api` xizmati uchun (`SUPERVISOR_SAAS_TOKEN` bilan);
 * admin JWT bilan aloqasi yo'q. Desktop klinikalar (`mode='desktop'`) bu yerdan
 * ko'rinmaydi ham, o'zgarmaydi ham.
 */

/** Yangi SaaS tenantga beriladigan sinov muddati (kun). */
export const SAAS_TRIAL_DAYS = 14;
const DAY_MS = 86_400_000;

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest();

/**
 * Xizmat kaliti: `Authorization: Bearer <SUPERVISOR_SAAS_TOKEN>`. Env yo'q yoki
 * <32 bayt bo'lsa — butun yo'l yopiq (503), hech qachon "ochiq" emas.
 * Solishtirish — SHA-256 ustida `timingSafeEqual` (uzunlik oqmasligi uchun).
 */
const saasTokenMiddleware: MiddlewareHandler = async (c, next) => {
  const expected = process.env.SUPERVISOR_SAAS_TOKEN;
  if (!expected || Buffer.byteLength(expected) < 32) {
    return c.json({ error: { code: 'SAAS_NOT_CONFIGURED' } }, 503);
  }
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
  }
  const given = header.slice(7).trim();
  if (!crypto.timingSafeEqual(sha256(given), sha256(expected))) {
    return c.json({ error: { code: 'UNAUTHORIZED' } }, 401);
  }
  await next();
};

const registerSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(200),
  ownerFullName: z.string().min(1).max(120),
  ownerPhone: z.string().min(1).max(30),
  contactPhone: z.string().max(30).optional(),
  defaultLanguage: z.enum(['uz', 'ru']).default('uz'),
});

const uuidSchema = z.string().uuid();

const toStatus = (clinic: typeof clinics.$inferSelect) => ({
  clinicId: clinic.id,
  tenantId: clinic.saasTenantId,
  mode: 'saas' as const,
  subscriptionExpiresAt: clinic.subscriptionExpiresAt
    ? clinic.subscriptionExpiresAt.toISOString()
    : null,
});

export const saasRoutes = () => {
  const app = new Hono();
  app.use('*', saasTokenMiddleware);

  // Idempotent: bir tenant — bitta klinika (UNIQUE saas_tenant_id). Qayta chaqiruv
  // (retry worker, parallel register) mavjud qatorni QAYTARADI — sinov muddati
  // qayta boshlanmaydi. 201 = yangi, 200 = mavjud.
  app.post('/clinics', zValidator('json', registerSchema), async (c) => {
    const data = c.req.valid('json');
    const [inserted] = await db
      .insert(clinics)
      .values({
        name: data.name,
        contactPhone: data.contactPhone ? normalizePhone(data.contactPhone) : null,
        ownerFullName: data.ownerFullName,
        ownerPhone: normalizePhone(data.ownerPhone),
        defaultLanguage: data.defaultLanguage,
        mode: 'saas',
        saasTenantId: data.tenantId,
        subscriptionExpiresAt: new Date(Date.now() + SAAS_TRIAL_DAYS * DAY_MS),
      })
      .onConflictDoNothing({ target: clinics.saasTenantId })
      .returning();
    if (inserted) return c.json(toStatus(inserted), 201);

    const existing = await db.query.clinics.findFirst({
      where: eq(clinics.saasTenantId, data.tenantId),
    });
    if (!existing) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    return c.json(toStatus(existing), 200);
  });

  app.get('/clinics/:tenantId/status', async (c) => {
    const parsed = uuidSchema.safeParse(c.req.param('tenantId'));
    if (!parsed.success) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    const clinic = await db.query.clinics.findFirst({
      where: eq(clinics.saasTenantId, parsed.data),
    });
    if (!clinic) return c.json({ error: { code: 'NOT_FOUND' } }, 404);
    return c.json(toStatus(clinic));
  });

  return app;
};

/**
 * Vendor admin SaaS klinika obunasini uzaytiradi (desktop `renew` naqshi —
 * `licenses.service.renew`). `GET /status` keyingi sinxronda yangi muddatni beradi.
 */
export const renewSaasClinic = async (clinicId: string, expiresAt: Date) => {
  if (expiresAt.getTime() <= Date.now()) {
    throw Object.assign(new Error('EXPIRES_IN_PAST'), { status: 400 });
  }
  const [updated] = await db
    .update(clinics)
    .set({ subscriptionExpiresAt: expiresAt })
    .where(eq(clinics.id, clinicId))
    .returning();
  if (!updated) throw Object.assign(new Error('CLINIC_NOT_FOUND'), { status: 404 });
  return updated;
};
