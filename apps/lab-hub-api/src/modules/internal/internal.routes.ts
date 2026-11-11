import { createRoute, z } from '@hono/zod-openapi';
import { desc, eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { clinics, labs, labUsers } from '../../db/schema';
import { withLab } from '../../db/scoped';
import type { Deps } from '../../deps';
import { generateDek, wrapDek } from '../../lib/crypto';
import { ApiError } from '../../lib/errors';
import { createRouter, jsonBody, OK } from '../../lib/openapi';
import { generateTempPassword, hashPassword } from '../../lib/password';
import { normalizePhone } from '../../lib/phone';
import { subscriptionState } from '../../lib/subscription';
import { bearer, safeEqual } from '../../lib/tokens';

/**
 * Supervisor → Hub ichki admin API. `Authorization: Bearer SUPERVISOR_HUB_TOKEN`
 * (timing-safe). Faqat ichki tarmoq/HTTPS (Caddy `/internal/*`ni tashqariga ochmaydi).
 */
const tags = ['internal'];

const createLabSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    city: z.string().trim().max(100).optional(),
    description: z.string().trim().max(2000).optional(),
    catalogVisible: z.boolean().optional(),
    expiresAt: z.iso.datetime({ offset: true }),
    leadFullName: z.string().trim().min(2).max(200),
    leadPhone: z.string().trim().min(9).max(20),
  })
  .strict();

const patchLabSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    city: z.string().trim().max(100).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    catalogVisible: z.boolean().optional(),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

const upsertClinicSchema = z
  .object({
    supervisorClinicId: z.uuid(),
    mode: z.enum(['desktop', 'saas']),
    name: z.string().trim().min(1).max(200),
    expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
  })
  .strict();

const labDto = (l: typeof labs.$inferSelect, now: Date) => ({
  id: l.id,
  name: l.name,
  city: l.city,
  description: l.description,
  catalogVisible: l.catalogVisible,
  expiresAt: l.expiresAt.toISOString(),
  subscription: subscriptionState(l.expiresAt, now),
  createdAt: l.createdAt.toISOString(),
});

export const internalRoutes = (deps: Deps) => {
  const app = createRouter();

  const auth: MiddlewareHandler = async (c, next) => {
    const token = bearer(c.req.header('Authorization'));
    if (!token || !safeEqual(token, deps.config.supervisorHubToken)) {
      return c.json({ error: { code: 'internal.unauthorized' } }, 401);
    }
    await next();
  };
  app.use('*', auth);

  app.openapi(
    createRoute({ method: 'get', path: '/labs', tags, summary: 'Lablar ro‘yxati', responses: OK }),
    async (c) => {
      const rows = await deps.db.select().from(labs).orderBy(desc(labs.createdAt));
      const now = deps.now();
      return c.json({ labs: rows.map((l) => labDto(l, now)) });
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/labs',
      tags,
      summary: 'Lab + lead foydalanuvchi (vaqtinchalik parol bir marta)',
      request: { body: jsonBody(createLabSchema) },
      responses: OK,
    }),
    async (c) => {
      const b = c.req.valid('json');
      const phone = normalizePhone(b.leadPhone);
      if (phone.length < 12) throw new ApiError(400, 'phone.invalid');
      const labId = crypto.randomUUID();
      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      try {
        const lab = await withLab(deps.db, labId, async (tx) => {
          const [lab] = await tx
            .insert(labs)
            .values({
              id: labId,
              name: b.name,
              city: b.city ?? null,
              description: b.description ?? null,
              catalogVisible: b.catalogVisible ?? true,
              dekWrapped: wrapDek(deps.config.kek, generateDek(), labId),
              expiresAt: new Date(b.expiresAt),
            })
            .returning();
          await tx.insert(labUsers).values({
            labId,
            fullName: b.leadFullName,
            phone,
            passwordHash,
            role: 'lead',
            mustChangePassword: true,
          });
          return lab!;
        });
        return c.json(
          { lab: labDto(lab, deps.now()), lead: { fullName: b.leadFullName, phone, tempPassword } },
          201,
        );
      } catch (err) {
        if (isUniqueViolation(err)) throw new ApiError(409, 'lab_user.phone_taken');
        throw err;
      }
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/labs/{id}',
      tags,
      summary: 'Lab nomi / katalog / obuna muddati',
      request: { params: z.object({ id: z.uuid() }), body: jsonBody(patchLabSchema) },
      responses: OK,
    }),
    async (c) => {
      const { id } = c.req.valid('param');
      const b = c.req.valid('json');
      const [row] = await deps.db
        .update(labs)
        .set({
          ...(b.name !== undefined ? { name: b.name } : {}),
          ...(b.city !== undefined ? { city: b.city } : {}),
          ...(b.description !== undefined ? { description: b.description } : {}),
          ...(b.catalogVisible !== undefined ? { catalogVisible: b.catalogVisible } : {}),
          ...(b.expiresAt !== undefined ? { expiresAt: new Date(b.expiresAt) } : {}),
          updatedAt: deps.now(),
        })
        .where(eq(labs.id, id))
        .returning();
      if (!row) throw new ApiError(404, 'lab.not_found');
      return c.json({ lab: labDto(row, deps.now()) });
    },
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/clinics',
      tags,
      summary: 'Supervisor klinikasini upsert (obuna muddati)',
      request: { body: jsonBody(upsertClinicSchema) },
      responses: OK,
    }),
    async (c) => {
      const b = c.req.valid('json');
      const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
      const [row] = await deps.db
        .insert(clinics)
        .values({
          supervisorClinicId: b.supervisorClinicId,
          mode: b.mode,
          name: b.name,
          expiresAt,
          lastVerifiedAt: deps.now(),
        })
        .onConflictDoUpdate({
          target: clinics.supervisorClinicId,
          set: { mode: b.mode, name: b.name, expiresAt, lastVerifiedAt: deps.now() },
        })
        .returning({ id: clinics.id });
      return c.json({ clinicId: row!.id });
    },
  );

  return app;
};

export const isUniqueViolation = (err: unknown): boolean => {
  let e: unknown = err;
  for (let i = 0; i < 3 && e; i++) {
    if ((e as { code?: string }).code === '23505') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
};
