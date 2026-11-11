import { createRoute, z } from '@hono/zod-openapi';
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import type { Tx } from '../../db/client';
import {
  type CaseStatus,
  cases,
  clinics,
  type Lab,
  labClinicLinks,
  labs,
  labUsers,
  priceListItems,
  settlements,
} from '../../db/schema';
import { withLab, withLoginPhone } from '../../db/scoped';
import type { Deps } from '../../deps';
import { ApiError } from '../../lib/errors';
import { type LabClaims, signLabToken, verifyLabToken } from '../../lib/jwt';
import { createRouter, jsonBody, OK } from '../../lib/openapi';
import {
  generateTempPassword,
  hashPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from '../../lib/password';
import { normalizePhone } from '../../lib/phone';
import { createRateLimiter } from '../../lib/rate-limit';
import { isBlocked, subscriptionState } from '../../lib/subscription';
import { bearer } from '../../lib/tokens';
import {
  addFile,
  addMessage,
  caseDetail,
  LAB_TRANSITIONS,
  recordEvent,
  toCaseDto,
} from '../cases/case-core';
import { fileResponse } from '../clinic/clinic.routes';
import { isUniqueViolation } from '../internal/internal.routes';

type LabEnv = { Variables: { claims: LabClaims; lab: Lab } };
const tags = ['lab'];
const idParam = z.object({ id: z.uuid() });
const money = z.number().positive().max(1e12).multipleOf(0.01);
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/** Ro'yxat tablari (kanvas LabPortal): Yangi / Ishda / Tayyor / Jo'natilgan / Rad etilgan. */
const TABS: Record<string, CaseStatus[]> = {
  new: ['sent', 'remake'],
  in_work: ['accepted', 'in_progress'],
  ready: ['ready'],
  shipped: ['delivered'],
  rejected: ['rejected'],
};

// Parol almashtirilmaguncha yoki obuna tugaganda ham ochiq yo'llar.
const OPEN_WHEN_PWC = new Set(['/v1/lab/auth/change-password', '/v1/lab/me']);
const OPEN_WHEN_EXPIRED = new Set(['/v1/lab/auth/change-password', '/v1/lab/me']);

const userDto = (u: typeof labUsers.$inferSelect) => ({
  id: u.id,
  fullName: u.fullName,
  phone: u.phone,
  role: u.role,
  isActive: u.isActive,
  mustChangePassword: u.mustChangePassword,
  createdAt: u.createdAt.toISOString(),
});

const monthRange = (p: string) => {
  const [y, m] = p.split('-').map(Number) as [number, number];
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
};

export const labRoutes = (deps: Deps) => {
  const app = createRouter<LabEnv>();
  const loginLimiter = createRateLimiter(10, 15 * 60_000);

  // --- login (tokensiz) -------------------------------------------------------
  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/login',
      tags,
      summary: 'Lab xodimi kirishi (telefon + parol)',
      request: {
        body: jsonBody(
          z
            .object({ phone: z.string().min(9).max(20), password: z.string().min(1).max(200) })
            .strict(),
        ),
      },
      responses: OK,
    }),
    async (c) => {
      const b = c.req.valid('json');
      const phone = normalizePhone(b.phone);
      const ip =
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
        c.req.header('x-real-ip') ??
        'unknown';
      if (!loginLimiter.hit(`${ip}|${phone}`)) throw new ApiError(429, 'rate_limited');
      const user = await withLoginPhone(deps.db, phone, (t) =>
        t.query.labUsers.findFirst({ where: eq(labUsers.phone, phone) }),
      );
      if (!user || !user.isActive || !(await verifyPassword(b.password, user.passwordHash))) {
        throw new ApiError(401, 'auth.invalid_credentials');
      }
      const lab = await deps.db.query.labs.findFirst({ where: eq(labs.id, user.labId) });
      const token = await signLabToken(deps.config.jwtSecret, {
        sub: user.id,
        lab: user.labId,
        role: user.role,
        pwc: user.mustChangePassword,
      });
      return c.json({
        token,
        mustChangePassword: user.mustChangePassword,
        user: userDto(user),
        lab: lab
          ? {
              id: lab.id,
              name: lab.name,
              subscription: subscriptionState(lab.expiresAt, deps.now()),
            }
          : null,
      });
    },
  );

  // --- auth middleware --------------------------------------------------------
  const auth: MiddlewareHandler<LabEnv> = async (c, next) => {
    const token = bearer(c.req.header('Authorization'));
    const claims = token ? await verifyLabToken(deps.config.jwtSecret, token) : null;
    if (!claims) return c.json({ error: { code: 'auth.unauthorized' } }, 401);
    const lab = await deps.db.query.labs.findFirst({ where: eq(labs.id, claims.lab) });
    if (!lab) return c.json({ error: { code: 'auth.unauthorized' } }, 401);
    // Foydalanuvchi o'chirilgan bo'lsa token darhol ishlamaydi.
    const user = await withLab(deps.db, lab.id, (t) =>
      t.query.labUsers.findFirst({
        where: eq(labUsers.id, claims.sub),
        columns: { isActive: true, mustChangePassword: true },
      }),
    );
    if (!user?.isActive) return c.json({ error: { code: 'auth.unauthorized' } }, 401);
    if (user.mustChangePassword && !OPEN_WHEN_PWC.has(c.req.path)) {
      return c.json({ error: { code: 'auth.password_change_required' } }, 403);
    }
    if (isBlocked(lab.expiresAt, deps.now()) && !OPEN_WHEN_EXPIRED.has(c.req.path)) {
      return c.json({ error: { code: 'lab.subscription_expired' } }, 403);
    }
    c.set('claims', claims);
    c.set('lab', lab);
    await next();
  };
  app.use('*', async (c, next) => (c.req.path === '/v1/lab/auth/login' ? next() : auth(c, next)));

  const tx = <T>(c: Context<LabEnv>, fn: (tx: Tx) => Promise<T>) =>
    withLab(deps.db, c.get('lab').id, fn);
  const requireLead = (c: Context<LabEnv>) => {
    if (c.get('claims').role !== 'lead') throw new ApiError(403, 'auth.lead_only');
  };
  const dek = (c: Context<LabEnv>) => deps.keyring.dekFor(c.get('lab'));
  const getCase = async (t: Tx, id: string) => {
    const row = await t.query.cases.findFirst({ where: eq(cases.id, id) });
    if (!row) throw new ApiError(404, 'case.not_found');
    return row;
  };

  app.openapi(
    createRoute({
      method: 'post',
      path: '/auth/change-password',
      tags,
      summary: 'Parolni almashtirish (vaqtinchalik paroldan keyin majburiy)',
      request: {
        body: jsonBody(
          z
            .object({
              currentPassword: z.string().min(1),
              newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(200),
            })
            .strict(),
        ),
      },
      responses: OK,
    }),
    async (c) => {
      const b = c.req.valid('json');
      if (b.currentPassword === b.newPassword) throw new ApiError(400, 'auth.password_same');
      const claims = c.get('claims');
      const user = await tx(c, async (t) => {
        const u = await t.query.labUsers.findFirst({ where: eq(labUsers.id, claims.sub) });
        if (!u || !(await verifyPassword(b.currentPassword, u.passwordHash))) {
          throw new ApiError(401, 'auth.invalid_credentials');
        }
        const [updated] = await t
          .update(labUsers)
          .set({ passwordHash: await hashPassword(b.newPassword), mustChangePassword: false })
          .where(eq(labUsers.id, u.id))
          .returning();
        return updated!;
      });
      const token = await signLabToken(deps.config.jwtSecret, {
        sub: user.id,
        lab: user.labId,
        role: user.role,
        pwc: false,
      });
      return c.json({ token, user: userDto(user) });
    },
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/me',
      tags,
      summary: 'Joriy foydalanuvchi va lab obunasi',
      responses: OK,
    }),
    async (c) => {
      const lab = c.get('lab');
      const user = await tx(c, (t) =>
        t.query.labUsers.findFirst({ where: eq(labUsers.id, c.get('claims').sub) }),
      );
      return c.json({
        user: userDto(user!),
        lab: {
          id: lab.id,
          name: lab.name,
          city: lab.city,
          expiresAt: lab.expiresAt.toISOString(),
          subscription: subscriptionState(lab.expiresAt, deps.now()),
        },
      });
    },
  );

  // --- ishlar -----------------------------------------------------------------
  app.openapi(
    createRoute({
      method: 'get',
      path: '/cases',
      tags,
      summary: 'Ishlar ro‘yxati (tab, texnik, klinika, muddat)',
      request: {
        query: z.object({
          tab: z.enum(['new', 'in_work', 'ready', 'shipped', 'rejected']).optional(),
          technicianId: z.uuid().optional(),
          clinicId: z.uuid().optional(),
          dueBefore: z.iso.date().optional(),
          limit: z.coerce.number().int().min(1).max(500).default(200),
        }),
      },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        const q = c.req.valid('query');
        const where = and(
          q.tab ? inArray(cases.status, TABS[q.tab]!) : undefined,
          q.technicianId ? eq(cases.assignedTechnicianId, q.technicianId) : undefined,
          q.clinicId ? eq(cases.clinicId, q.clinicId) : undefined,
          q.dueBefore ? lte(cases.dueDate, q.dueBefore) : undefined,
        );
        const rows = await t
          .select({ c: cases, clinicName: clinics.name })
          .from(cases)
          .innerJoin(clinics, eq(clinics.id, cases.clinicId))
          .where(where)
          .orderBy(sql`${cases.dueDate} ASC NULLS LAST`, desc(cases.sentAt))
          .limit(q.limit);
        const d = dek(c);
        const counts = await t
          .select({ status: cases.status, n: sql<number>`count(*)::int` })
          .from(cases)
          .groupBy(cases.status);
        const tabCounts = Object.fromEntries(
          Object.entries(TABS).map(([k, st]) => [
            k,
            counts.filter((x) => st.includes(x.status)).reduce((s, x) => s + x.n, 0),
          ]),
        );
        return c.json({
          cases: rows.map((r) => toCaseDto(r.c, d, { clinicName: r.clinicName })),
          tabCounts,
        });
      }),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/cases/{id}',
      tags,
      summary: 'Ish detali',
      request: { params: idParam },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) =>
        c.json(await caseDetail(t, await getCase(t, c.req.valid('param').id), dek(c))),
      ),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/cases/{id}/assign',
      tags,
      summary: 'Texnikka taqsimlash (lead)',
      request: {
        params: idParam,
        body: jsonBody(z.object({ technicianId: z.uuid().nullable() }).strict()),
      },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        requireLead(c);
        const row = await getCase(t, c.req.valid('param').id);
        const { technicianId } = c.req.valid('json');
        if (technicianId) {
          const u = await t.query.labUsers.findFirst({
            where: and(eq(labUsers.id, technicianId), eq(labUsers.isActive, true)),
          });
          if (!u) throw new ApiError(404, 'lab_user.not_found');
        }
        const [u] = await t
          .update(cases)
          .set({ assignedTechnicianId: technicianId, updatedAt: deps.now() })
          .where(eq(cases.id, row.id))
          .returning();
        await recordEvent(t, {
          caseRow: u!,
          type: 'assigned',
          actor: 'lab',
          actorUserId: c.get('claims').sub,
          payload: { technicianId },
        });
        return c.json({ case: toCaseDto(u!, dek(c)) });
      }),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/cases/{id}/status',
      tags,
      summary: 'Holat: accepted / in_progress / ready / rejected (sabab bilan)',
      request: {
        params: idParam,
        body: jsonBody(
          z
            .object({
              to: z.enum(['accepted', 'in_progress', 'ready', 'rejected']),
              reason: z.string().trim().max(2000).optional(),
            })
            .strict(),
        ),
      },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        const row = await getCase(t, c.req.valid('param').id);
        const { to, reason } = c.req.valid('json');
        if (to === 'rejected' && !reason) throw new ApiError(400, 'case.reject_reason_required');
        const from = LAB_TRANSITIONS[to];
        if (!from.includes(row.status))
          throw new ApiError(409, 'case.bad_transition', { from: row.status, to });
        const now = deps.now();
        const [u] = await t
          .update(cases)
          .set({
            status: to,
            updatedAt: now,
            ...(to === 'ready' ? { readyAt: now } : {}),
            ...(to === 'rejected' ? { rejectReason: reason } : {}),
          })
          .where(and(eq(cases.id, row.id), eq(cases.status, row.status)))
          .returning();
        if (!u) throw new ApiError(409, 'case.concurrent_update');
        await recordEvent(t, {
          caseRow: u,
          type: 'status',
          actor: 'lab',
          actorUserId: c.get('claims').sub,
          payload: { from: row.status, to, ...(to === 'rejected' ? { reason } : {}) },
        });
        return c.json({ case: toCaseDto(u, dek(c)) });
      }),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/cases/{id}/price',
      tags,
      summary: 'Narx taklifi (lead; tasdiqlangandan keyin o‘zgarmaydi)',
      request: {
        params: idParam,
        body: jsonBody(z.object({ price: money, priceListItemId: z.uuid().optional() }).strict()),
      },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        requireLead(c);
        const row = await getCase(t, c.req.valid('param').id);
        const b = c.req.valid('json');
        if (b.priceListItemId) {
          const item = await t.query.priceListItems.findFirst({
            where: eq(priceListItems.id, b.priceListItemId),
          });
          if (!item) throw new ApiError(404, 'price_list_item.not_found');
        }
        const price = b.price.toFixed(2);
        const [u] = await t
          .update(cases)
          .set({ proposedPrice: price, updatedAt: deps.now() })
          .where(and(eq(cases.id, row.id), isNull(cases.approvedPrice)))
          .returning();
        if (!u) throw new ApiError(409, 'price.already_approved');
        await recordEvent(t, {
          caseRow: u,
          type: 'price_proposed',
          actor: 'lab',
          actorUserId: c.get('claims').sub,
          payload: { price, priceListItemId: b.priceListItemId ?? null },
        });
        return c.json({ case: toCaseDto(u, dek(c)) });
      }),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/cases/{id}/messages',
      tags,
      summary: 'Yozishma',
      request: {
        params: idParam,
        body: jsonBody(z.object({ body: z.string().trim().min(1).max(5000) }).strict()),
      },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        const row = await getCase(t, c.req.valid('param').id);
        if (row.purgedAt) throw new ApiError(409, 'case.purged');
        const me = await t.query.labUsers.findFirst({
          where: eq(labUsers.id, c.get('claims').sub),
          columns: { fullName: true },
        });
        const m = await addMessage(t, row, dek(c), {
          author: 'lab',
          authorName: me?.fullName ?? null,
          body: c.req.valid('json').body,
          actorUserId: c.get('claims').sub,
        });
        return c.json({ message: { id: m.id, createdAt: m.createdAt.toISOString() } }, 201);
      }),
  );

  app.post('/cases/:id/files', async (c) =>
    tx(c, async (t) => {
      if (!/^[0-9a-f-]{36}$/i.test(c.req.param('id'))) throw new ApiError(404, 'case.not_found');
      const row = await getCase(t, c.req.param('id'));
      const form = await c.req.formData().catch(() => null);
      const file = form?.get('file');
      if (!(file instanceof File)) throw new ApiError(400, 'file.required');
      const out = await addFile(t, deps.storage, row, dek(c), file, {
        uploadedBy: 'lab',
        maxBytes: deps.config.maxUploadBytes,
        actorUserId: c.get('claims').sub,
      });
      return c.json({ file: out }, 201);
    }),
  );

  app.get('/cases/:id/files/:fileId', async (c) =>
    tx(c, async (t) => {
      if (!/^[0-9a-f-]{36}$/i.test(c.req.param('id'))) throw new ApiError(404, 'case.not_found');
      const row = await getCase(t, c.req.param('id'));
      return fileResponse(c, t, deps, { c: row, dek: dek(c) }, c.req.param('fileId'));
    }),
  );

  // --- klinikalar bilan ulanish ----------------------------------------------
  app.openapi(
    createRoute({
      method: 'get',
      path: '/links',
      tags,
      summary: 'Klinika ulanish so‘rovlari',
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        const rows = await t
          .select({ link: labClinicLinks, clinicName: clinics.name })
          .from(labClinicLinks)
          .innerJoin(clinics, eq(clinics.id, labClinicLinks.clinicId))
          .orderBy(desc(labClinicLinks.requestedAt));
        return c.json({
          links: rows.map(({ link, clinicName }) => ({
            id: link.id,
            clinicId: link.clinicId,
            clinicName,
            status: link.status,
            requestedAt: link.requestedAt.toISOString(),
            decidedAt: link.decidedAt?.toISOString() ?? null,
          })),
        });
      }),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/links/{id}/decision',
      tags,
      summary: 'Ulanishni tasdiqlash / rad etish / bekor qilish (lead)',
      request: {
        params: idParam,
        body: jsonBody(z.object({ decision: z.enum(['approve', 'reject', 'revoke']) }).strict()),
      },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        requireLead(c);
        const { decision } = c.req.valid('json');
        const link = await t.query.labClinicLinks.findFirst({
          where: eq(labClinicLinks.id, c.req.valid('param').id),
        });
        if (!link) throw new ApiError(404, 'link.not_found');
        const allowed: Record<string, string[]> = {
          approve: ['pending', 'rejected', 'revoked'],
          reject: ['pending'],
          revoke: ['active'],
        };
        if (!allowed[decision]!.includes(link.status)) {
          throw new ApiError(409, 'link.bad_transition', { from: link.status, decision });
        }
        const status =
          decision === 'approve' ? 'active' : decision === 'reject' ? 'rejected' : 'revoked';
        const [u] = await t
          .update(labClinicLinks)
          .set({ status, decidedAt: deps.now() })
          .where(eq(labClinicLinks.id, link.id))
          .returning();
        return c.json({ link: { id: u!.id, clinicId: u!.clinicId, status: u!.status } });
      }),
  );

  // --- prays-list -------------------------------------------------------------
  const priceDto = (p: typeof priceListItems.$inferSelect) => ({
    id: p.id,
    workType: p.workType,
    material: p.material,
    price: p.price,
    isActive: p.isActive,
  });
  const priceBody = z.object({
    workType: z.string().trim().min(1).max(200),
    material: z.string().trim().max(200).nullable().optional(),
    price: money,
    isActive: z.boolean().optional(),
  });

  app.openapi(
    createRoute({ method: 'get', path: '/price-list', tags, summary: 'Prays-list', responses: OK }),
    async (c) =>
      tx(c, async (t) => {
        const rows = await t
          .select()
          .from(priceListItems)
          .orderBy(asc(priceListItems.workType), asc(priceListItems.material));
        return c.json({ items: rows.map(priceDto) });
      }),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/price-list',
      tags,
      summary: 'Prays-list qatori (lead)',
      request: { body: jsonBody(priceBody.strict()) },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        requireLead(c);
        const b = c.req.valid('json');
        const [row] = await t
          .insert(priceListItems)
          .values({
            labId: c.get('lab').id,
            workType: b.workType,
            material: b.material ?? null,
            price: b.price.toFixed(2),
            isActive: b.isActive ?? true,
          })
          .returning();
        return c.json({ item: priceDto(row!) }, 201);
      }),
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/price-list/{id}',
      tags,
      summary: 'Prays-list qatorini tahrirlash (lead)',
      request: { params: idParam, body: jsonBody(priceBody.partial().strict()) },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        requireLead(c);
        const b = c.req.valid('json');
        const [row] = await t
          .update(priceListItems)
          .set({
            ...(b.workType !== undefined ? { workType: b.workType } : {}),
            ...(b.material !== undefined ? { material: b.material } : {}),
            ...(b.price !== undefined ? { price: b.price.toFixed(2) } : {}),
            ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
            updatedAt: deps.now(),
          })
          .where(eq(priceListItems.id, c.req.valid('param').id))
          .returning();
        if (!row) throw new ApiError(404, 'price_list_item.not_found');
        return c.json({ item: priceDto(row) });
      }),
  );

  app.openapi(
    createRoute({
      method: 'delete',
      path: '/price-list/{id}',
      tags,
      summary: 'Prays-list qatorini o‘chirish (lead)',
      request: { params: idParam },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        requireLead(c);
        const rows = await t
          .delete(priceListItems)
          .where(eq(priceListItems.id, c.req.valid('param').id))
          .returning({ id: priceListItems.id });
        if (rows.length === 0) throw new ApiError(404, 'price_list_item.not_found');
        return c.json({ deleted: true });
      }),
  );

  // --- akt-sverka -------------------------------------------------------------
  const settlementTotals = async (t: Tx, p: string, clinicId?: string) => {
    const { from, to } = monthRange(p);
    return t
      .select({
        clinicId: cases.clinicId,
        clinicName: clinics.name,
        total: sql<string>`coalesce(sum(${cases.approvedPrice}), 0)::numeric(14,2)::text`,
        caseCount: sql<number>`count(*)::int`,
      })
      .from(cases)
      .innerJoin(clinics, eq(clinics.id, cases.clinicId))
      .where(
        and(
          gte(cases.approvedAt, from),
          lt(cases.approvedAt, to),
          clinicId ? eq(cases.clinicId, clinicId) : undefined,
        ),
      )
      .groupBy(cases.clinicId, clinics.name)
      .orderBy(asc(clinics.name));
  };

  app.openapi(
    createRoute({
      method: 'get',
      path: '/settlements',
      tags,
      summary: 'Oylik akt-sverka (klinika bo‘yicha tasdiqlangan narxlar)',
      request: { query: z.object({ period }) },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        requireLead(c);
        const p = c.req.valid('query').period;
        const [totals, marks] = await Promise.all([
          settlementTotals(t, p),
          t.select().from(settlements).where(eq(settlements.period, p)),
        ]);
        const byClinic = new Map(marks.map((m) => [m.clinicId, m]));
        return c.json({
          period: p,
          rows: totals.map((r) => ({
            clinicId: r.clinicId,
            clinicName: r.clinicName,
            totalApproved: r.total,
            caseCount: r.caseCount,
            paidAt: byClinic.get(r.clinicId)?.paidAt?.toISOString() ?? null,
            paidTotal: byClinic.get(r.clinicId)?.paidAt
              ? byClinic.get(r.clinicId)!.totalApproved
              : null,
          })),
        });
      }),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/settlements/mark-paid',
      tags,
      summary: 'Klinika oyini to‘landi/to‘lanmadi deb belgilash (lead)',
      request: {
        body: jsonBody(z.object({ clinicId: z.uuid(), period, paid: z.boolean() }).strict()),
      },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        requireLead(c);
        const b = c.req.valid('json');
        const [tot] = await settlementTotals(t, b.period, b.clinicId);
        const totalApproved = tot?.total ?? '0.00';
        const now = deps.now();
        const [row] = await t
          .insert(settlements)
          .values({
            labId: c.get('lab').id,
            clinicId: b.clinicId,
            period: b.period,
            totalApproved,
            paidAt: b.paid ? now : null,
          })
          .onConflictDoUpdate({
            target: [settlements.labId, settlements.clinicId, settlements.period],
            set: { totalApproved, paidAt: b.paid ? now : null, updatedAt: now },
          })
          .returning();
        return c.json({
          settlement: {
            clinicId: row!.clinicId,
            period: row!.period,
            totalApproved: row!.totalApproved,
            paidAt: row!.paidAt?.toISOString() ?? null,
          },
        });
      }),
  );

  // --- xodimlar ---------------------------------------------------------------
  app.openapi(
    createRoute({ method: 'get', path: '/users', tags, summary: 'Lab xodimlari', responses: OK }),
    async (c) =>
      tx(c, async (t) =>
        c.json({
          users: (await t.select().from(labUsers).orderBy(asc(labUsers.fullName))).map(userDto),
        }),
      ),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/users',
      tags,
      summary: 'Texnik qo‘shish (lead; vaqtinchalik parol bir marta)',
      request: {
        body: jsonBody(
          z
            .object({
              fullName: z.string().trim().min(2).max(200),
              phone: z.string().min(9).max(20),
              role: z.enum(['technician', 'lead']).default('technician'),
            })
            .strict(),
        ),
      },
      responses: OK,
    }),
    async (c) => {
      requireLead(c);
      const b = c.req.valid('json');
      const phone = normalizePhone(b.phone);
      if (phone.length < 12) throw new ApiError(400, 'phone.invalid');
      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);
      try {
        const user = await tx(c, async (t) => {
          const [u] = await t
            .insert(labUsers)
            .values({
              labId: c.get('lab').id,
              fullName: b.fullName,
              phone,
              passwordHash,
              role: b.role,
              mustChangePassword: true,
            })
            .returning();
          return u!;
        });
        return c.json({ user: userDto(user), tempPassword }, 201);
      } catch (err) {
        if (isUniqueViolation(err)) throw new ApiError(409, 'lab_user.phone_taken');
        throw err;
      }
    },
  );

  app.openapi(
    createRoute({
      method: 'patch',
      path: '/users/{id}',
      tags,
      summary: 'Xodimni tahrirlash / o‘chirish (lead)',
      request: {
        params: idParam,
        body: jsonBody(
          z
            .object({
              fullName: z.string().trim().min(2).max(200).optional(),
              isActive: z.boolean().optional(),
            })
            .strict(),
        ),
      },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t) => {
        requireLead(c);
        const { id } = c.req.valid('param');
        const b = c.req.valid('json');
        if (id === c.get('claims').sub && b.isActive === false)
          throw new ApiError(409, 'lab_user.cannot_deactivate_self');
        const [u] = await t
          .update(labUsers)
          .set({
            ...(b.fullName !== undefined ? { fullName: b.fullName } : {}),
            ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
          })
          .where(eq(labUsers.id, id))
          .returning();
        if (!u) throw new ApiError(404, 'lab_user.not_found');
        return c.json({ user: userDto(u) });
      }),
  );

  return app;
};
