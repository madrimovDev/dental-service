import { createRoute, z } from '@hono/zod-openapi';
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import type { Tx } from '../../db/client';
import {
  type Case,
  type Clinic,
  caseEvents,
  caseFiles,
  caseMessages,
  cases,
  clinics,
  labClinicLinks,
  labs,
} from '../../db/schema';
import { withClinic } from '../../db/scoped';
import type { Deps } from '../../deps';
import { decryptBuffer, decryptOptional, encryptOptional, type Key } from '../../lib/crypto';
import { ApiError } from '../../lib/errors';
import { createRouter, jsonBody, OK } from '../../lib/openapi';
import { createRateLimiter } from '../../lib/rate-limit';
import { isBlocked } from '../../lib/subscription';
import { bearer, generateHubKey, safeEqual, sha256Hex } from '../../lib/tokens';
import {
  addFile,
  addMessage,
  caseDetail,
  contentDisposition,
  loadLab,
  recordEvent,
  toCaseDto,
} from '../cases/case-core';

type ClinicEnv = { Variables: { clinic: Clinic } };
const tags = ['clinic'];

const money = z.number().positive().max(1e12).multipleOf(0.01);

/**
 * PHI chegarasi (L3) — Hub'ga faqat shu maydonlar. `.strict()`: telefon, manzil,
 * pasport, karta raqami va boshqa noma'lum kalitlar 400 bilan rad etiladi
 * (klinika mapper testi bilan birga ikki tomonlama qulf).
 */
export const hubCaseSchema = z
  .object({
    labId: z.uuid(),
    patient: z
      .object({
        fullName: z.string().trim().min(1).max(200),
        sex: z.enum(['male', 'female']).nullable().optional(),
        age: z.number().int().min(0).max(130).nullable().optional(),
      })
      .strict(),
    clinicCode: z.string().trim().max(64).nullable().optional(),
    doctorName: z.string().trim().max(200).nullable().optional(),
    teeth: z.array(z.number().int().min(11).max(85)).max(32).default([]),
    workType: z.string().trim().min(1).max(200),
    material: z.string().trim().max(200).nullable().optional(),
    shade: z.string().trim().max(100).nullable().optional(),
    dueDate: z.iso.date().nullable().optional(),
    note: z.string().trim().max(5000).nullable().optional(),
  })
  .strict();

const refParam = z.object({
  ref: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9._:-]+$/),
});

const connectSchema = z
  .object({
    supervisorClinicId: z.uuid(),
    licenseKey: z.string().trim().min(1).max(100).optional(),
    serviceProof: z.string().min(1).max(500).optional(),
  })
  .strict()
  .refine((b) => !!b.licenseKey !== !!b.serviceProof, {
    message: 'licenseKey yoki serviceProof — aynan bittasi',
  });

export const clinicRoutes = (deps: Deps) => {
  const app = createRouter<ClinicEnv>();
  const connectLimiter = createRateLimiter(10, 15 * 60_000);

  const lab = (tx: Tx, labId: string) => loadLab(tx, labId);
  const dekOf = (l: { id: string; dekWrapped: string }) => deps.keyring.dekFor(l);

  /** Ishni klinika doirasida topadi (RLS) + lab obunasini tekshiradi. */
  const findCase = async (tx: Tx, clinicId: string, ref: string) => {
    const c = await tx.query.cases.findFirst({
      where: and(eq(cases.clinicId, clinicId), eq(cases.clinicCaseRef, ref)),
    });
    if (!c) throw new ApiError(404, 'case.not_found');
    const l = await lab(tx, c.labId);
    if (isBlocked(l.expiresAt, deps.now())) throw new ApiError(403, 'lab.subscription_expired');
    return { c, dek: dekOf(l) };
  };

  // --- connect (hub kalitisiz) ------------------------------------------------
  app.openapi(
    createRoute({
      method: 'post',
      path: '/connect',
      tags,
      summary: 'Klinikani Supervisor orqali tekshirib Hub kalitini berish (bir marta ko‘rinadi)',
      request: { body: jsonBody(connectSchema) },
      responses: OK,
    }),
    async (c) => {
      const b = c.req.valid('json');
      const ip =
        c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ??
        c.req.header('x-real-ip') ??
        'unknown';
      if (!connectLimiter.hit(`${ip}|${b.supervisorClinicId}`)) {
        throw new ApiError(429, 'rate_limited');
      }
      let expectedMode: 'desktop' | 'saas';
      if (b.serviceProof) {
        if (!deps.config.saasHubToken || !safeEqual(b.serviceProof, deps.config.saasHubToken)) {
          throw new ApiError(401, 'connect.invalid_proof');
        }
        expectedMode = 'saas';
      } else {
        expectedMode = 'desktop';
      }
      let v: Awaited<ReturnType<typeof deps.supervisor.verifyClinic>>;
      try {
        v = await deps.supervisor.verifyClinic(b.supervisorClinicId, { licenseKey: b.licenseKey });
      } catch {
        throw new ApiError(503, 'supervisor.unavailable');
      }
      if (!v) throw new ApiError(404, 'clinic.unknown');
      if (v.mode !== expectedMode) throw new ApiError(401, 'connect.invalid_proof');
      if (expectedMode === 'desktop' && !v.licenseMatches) {
        throw new ApiError(401, 'connect.invalid_license');
      }
      const expiresAt = v.expiresAt ? new Date(v.expiresAt) : null;
      if (!v.active || isBlocked(expiresAt, deps.now())) {
        throw new ApiError(403, 'clinic.subscription_expired');
      }
      const hubKey = generateHubKey();
      const now = deps.now();
      const [row] = await deps.db
        .insert(clinics)
        .values({
          supervisorClinicId: b.supervisorClinicId,
          mode: v.mode,
          name: v.name,
          hubKeyHash: sha256Hex(hubKey),
          expiresAt,
          lastVerifiedAt: now,
        })
        .onConflictDoUpdate({
          target: clinics.supervisorClinicId,
          set: {
            mode: v.mode,
            name: v.name,
            hubKeyHash: sha256Hex(hubKey),
            expiresAt,
            lastVerifiedAt: now,
          },
        })
        .returning({ id: clinics.id });
      return c.json({ clinicId: row!.id, hubKey });
    },
  );

  // --- hub key auth -----------------------------------------------------------
  /**
   * Klinika obunasini Supervisor bilan davriy qayta tekshirish: bloklangan
   * bo'lsa har 10 daqiqada (uzaytirilgan bo'lishi mumkin), faol bo'lsa har
   * 24 soatda (bekor qilingan bo'lishi mumkin). Supervisor javob bermasa —
   * keshdagi holat bilan davom etadi. Faol emas / topilmadi → `expiresAt = 0`.
   */
  const refreshClinic = async (clinic: Clinic): Promise<Clinic> => {
    const now = deps.now();
    const age = now.getTime() - (clinic.lastVerifiedAt?.getTime() ?? 0);
    const due = isBlocked(clinic.expiresAt, now) ? age > 10 * 60_000 : age > 24 * 3_600_000;
    if (!due) return clinic;
    let v: Awaited<ReturnType<typeof deps.supervisor.verifyClinic>>;
    try {
      v = await deps.supervisor.verifyClinic(clinic.supervisorClinicId, {});
    } catch {
      return clinic;
    }
    const expiresAt = v?.active && v.expiresAt ? new Date(v.expiresAt) : new Date(0);
    const [row] = await deps.db
      .update(clinics)
      .set({ expiresAt, lastVerifiedAt: now, ...(v ? { name: v.name } : {}) })
      .where(eq(clinics.id, clinic.id))
      .returning();
    return row ?? clinic;
  };

  const auth: MiddlewareHandler<ClinicEnv> = async (c, next) => {
    const key = bearer(c.req.header('Authorization'));
    if (!key) return c.json({ error: { code: 'clinic.unauthorized' } }, 401);
    const clinic = await deps.db.query.clinics.findFirst({
      where: eq(clinics.hubKeyHash, sha256Hex(key)),
    });
    if (!clinic) return c.json({ error: { code: 'clinic.unauthorized' } }, 401);
    const fresh = await refreshClinic(clinic);
    if (isBlocked(fresh.expiresAt, deps.now())) {
      return c.json({ error: { code: 'clinic.subscription_expired' } }, 403);
    }
    c.set('clinic', fresh);
    await next();
  };
  for (const p of ['/labs', '/links', '/links/*', '/cases/*', '/changes']) app.use(p, auth);

  const tx = <T>(c: Context<ClinicEnv>, fn: (tx: Tx, clinic: Clinic) => Promise<T>) =>
    withClinic(deps.db, c.get('clinic').id, (t) => fn(t, c.get('clinic')));

  // --- katalog va ulanish -----------------------------------------------------
  app.openapi(
    createRoute({
      method: 'get',
      path: '/labs',
      tags,
      summary: 'Ochiq lablar katalogi',
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t, clinic) => {
        const rows = await t
          .select()
          .from(labs)
          .where(eq(labs.catalogVisible, true))
          .orderBy(asc(labs.name));
        const links = await t
          .select()
          .from(labClinicLinks)
          .where(eq(labClinicLinks.clinicId, clinic.id));
        const byLab = new Map(links.map((l) => [l.labId, l.status]));
        const now = deps.now();
        return c.json({
          labs: rows
            .filter((l) => !isBlocked(l.expiresAt, now))
            .map((l) => ({
              id: l.id,
              name: l.name,
              city: l.city,
              description: l.description,
              linkStatus: byLab.get(l.id) ?? null,
            })),
        });
      }),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/links',
      tags,
      summary: 'Labga ulanish so‘rovi',
      request: { body: jsonBody(z.object({ labId: z.uuid() }).strict()) },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t, clinic) => {
        const { labId } = c.req.valid('json');
        const l = await t.query.labs.findFirst({ where: eq(labs.id, labId) });
        if (!l || !l.catalogVisible || isBlocked(l.expiresAt, deps.now())) {
          throw new ApiError(404, 'lab.not_found');
        }
        const existing = await t.query.labClinicLinks.findFirst({
          where: and(eq(labClinicLinks.labId, labId), eq(labClinicLinks.clinicId, clinic.id)),
        });
        let link = existing;
        if (!existing) {
          [link] = await t
            .insert(labClinicLinks)
            .values({ labId, clinicId: clinic.id, status: 'pending' })
            .onConflictDoNothing()
            .returning();
          link ??= await t.query.labClinicLinks.findFirst({
            where: and(eq(labClinicLinks.labId, labId), eq(labClinicLinks.clinicId, clinic.id)),
          });
        } else if (existing.status === 'rejected' || existing.status === 'revoked') {
          [link] = await t
            .update(labClinicLinks)
            .set({ status: 'pending', requestedAt: deps.now(), decidedAt: null })
            .where(eq(labClinicLinks.id, existing.id))
            .returning();
        }
        return c.json({ link: linkDto(link!, l.name) });
      }),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/links',
      tags,
      summary: 'Klinika ulanishlari',
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t, clinic) => {
        const rows = await t
          .select({ link: labClinicLinks, labName: labs.name })
          .from(labClinicLinks)
          .innerJoin(labs, eq(labs.id, labClinicLinks.labId))
          .where(eq(labClinicLinks.clinicId, clinic.id));
        return c.json({ links: rows.map((r) => linkDto(r.link, r.labName)) });
      }),
  );

  // --- ishlar -----------------------------------------------------------------
  app.openapi(
    createRoute({
      method: 'put',
      path: '/cases/{ref}',
      tags,
      summary: 'Ishni idempotent yaratish/yangilash (faqat `sent` holatda yangilanadi)',
      request: { params: refParam, body: jsonBody(hubCaseSchema) },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t, clinic) => {
        const { ref } = c.req.valid('param');
        const b = c.req.valid('json');
        const l = await t.query.labs.findFirst({ where: eq(labs.id, b.labId) });
        if (!l) throw new ApiError(404, 'lab.not_found');
        if (isBlocked(l.expiresAt, deps.now())) throw new ApiError(403, 'lab.subscription_expired');
        const link = await t.query.labClinicLinks.findFirst({
          where: and(eq(labClinicLinks.labId, l.id), eq(labClinicLinks.clinicId, clinic.id)),
        });
        if (link?.status !== 'active') throw new ApiError(403, 'link.not_active');
        const dek = dekOf(l);
        const fields = {
          patientNameEnc: encryptOptional(dek, b.patient.fullName),
          patientSex: b.patient.sex ?? null,
          patientAge: b.patient.age ?? null,
          clinicCode: b.clinicCode ?? null,
          doctorName: b.doctorName ?? null,
          teeth: b.teeth,
          workType: b.workType,
          material: b.material ?? null,
          shadeEnc: encryptOptional(dek, b.shade),
          dueDate: b.dueDate ?? null,
          noteEnc: encryptOptional(dek, b.note),
        };
        const [created] = await t
          .insert(cases)
          .values({
            labId: l.id,
            clinicId: clinic.id,
            clinicCaseRef: ref,
            status: 'sent',
            ...fields,
          })
          .onConflictDoNothing({ target: [cases.clinicId, cases.clinicCaseRef] })
          .returning();
        if (created) {
          await recordEvent(t, {
            caseRow: created,
            type: 'created',
            actor: 'clinic',
            payload: { status: 'sent' },
          });
          return c.json({
            caseId: created.id,
            status: created.status,
            created: true,
            applied: true,
          });
        }
        // Mavjud — qatorni qulflab, holatga qarab yangilaymiz (parallel qayta yuborish xavfsiz).
        const [existing] = (await t.execute(
          sql`SELECT id, lab_id, status FROM cases WHERE clinic_id = ${clinic.id} AND clinic_case_ref = ${ref} FOR UPDATE`,
        )) as unknown as { id: string; lab_id: string; status: string }[];
        if (!existing) throw new ApiError(409, 'case.conflict');
        if (existing.lab_id !== l.id) throw new ApiError(409, 'case.lab_mismatch');
        if (existing.status !== 'sent') {
          return c.json({
            caseId: existing.id,
            status: existing.status,
            created: false,
            applied: false,
          });
        }
        const [updated] = await t
          .update(cases)
          .set({ ...fields, updatedAt: deps.now() })
          .where(eq(cases.id, existing.id))
          .returning();
        await recordEvent(t, { caseRow: updated!, type: 'updated', actor: 'clinic' });
        return c.json({
          caseId: updated!.id,
          status: updated!.status,
          created: false,
          applied: true,
        });
      }),
  );

  app.openapi(
    createRoute({
      method: 'get',
      path: '/cases/{ref}',
      tags,
      summary: 'Ish holati (deshifrlangan)',
      request: { params: refParam },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t, clinic) => {
        const { c: row, dek } = await findCase(t, clinic.id, c.req.valid('param').ref);
        return c.json(await caseDetail(t, row, dek));
      }),
  );

  // Multipart — OpenAPI'dan tashqari (apps/api patientImages.upload naqshi).
  app.post('/cases/:ref/files', async (c) =>
    tx(c, async (t, clinic) => {
      const { c: row, dek } = await findCase(t, clinic.id, c.req.param('ref'));
      const form = await c.req.formData().catch(() => null);
      const file = form?.get('file');
      if (!(file instanceof File)) throw new ApiError(400, 'file.required');
      const out = await addFile(t, deps.storage, row, dek, file, {
        uploadedBy: 'clinic',
        maxBytes: deps.config.maxUploadBytes,
      });
      return c.json({ file: out }, 201);
    }),
  );

  app.get('/cases/:ref/files/:fileId', async (c) =>
    tx(c, async (t, clinic) =>
      fileResponse(
        c,
        t,
        deps,
        await findCase(t, clinic.id, c.req.param('ref')),
        c.req.param('fileId'),
      ),
    ),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/cases/{ref}/messages',
      tags,
      summary: 'Yozishma',
      request: {
        params: refParam,
        body: jsonBody(
          z
            .object({
              body: z.string().trim().min(1).max(5000),
              authorName: z.string().max(200).optional(),
            })
            .strict(),
        ),
      },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t, clinic) => {
        const { c: row, dek } = await findCase(t, clinic.id, c.req.valid('param').ref);
        if (row.purgedAt) throw new ApiError(409, 'case.purged');
        const b = c.req.valid('json');
        const m = await addMessage(t, row, dek, {
          author: 'clinic',
          authorName: b.authorName,
          body: b.body,
        });
        return c.json({ message: { id: m.id, createdAt: m.createdAt.toISOString() } }, 201);
      }),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/cases/{ref}/approve-price',
      tags,
      summary: 'Lab taklif qilgan narxni tasdiqlash (idempotent)',
      request: { params: refParam, body: jsonBody(z.object({ price: money }).strict()) },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t, clinic) => {
        const { c: row } = await findCase(t, clinic.id, c.req.valid('param').ref);
        const price = c.req.valid('json').price.toFixed(2);
        // Shartli UPDATE — parallel ikki bosishda faqat bittasi o'tadi.
        const [approved] = await t
          .update(cases)
          .set({ approvedPrice: price, approvedAt: deps.now(), updatedAt: deps.now() })
          .where(
            and(eq(cases.id, row.id), isNull(cases.approvedPrice), eq(cases.proposedPrice, price)),
          )
          .returning();
        if (approved) {
          await recordEvent(t, {
            caseRow: approved,
            type: 'price_approved',
            actor: 'clinic',
            payload: { price },
          });
          return c.json({
            approvedPrice: price,
            approvedAt: approved.approvedAt!.toISOString(),
            alreadyApproved: false,
          });
        }
        const [cur] = (await t.execute(
          sql`SELECT proposed_price, approved_price, approved_at FROM cases WHERE id = ${row.id} FOR UPDATE`,
        )) as unknown as {
          proposed_price: string | null;
          approved_price: string | null;
          approved_at: string | Date | null;
        }[];
        if (cur?.approved_price != null) {
          if (cur.approved_price === price) {
            return c.json({
              approvedPrice: price,
              approvedAt: new Date(cur.approved_at!).toISOString(),
              alreadyApproved: true,
            });
          }
          throw new ApiError(409, 'price.already_approved');
        }
        if (cur?.proposed_price == null) throw new ApiError(409, 'price.not_proposed');
        throw new ApiError(409, 'price.mismatch', { proposedPrice: cur.proposed_price });
      }),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/cases/{ref}/delivered',
      tags,
      summary: 'Klinika ishni qabul qildi (ready → delivered, idempotent)',
      request: { params: refParam },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t, clinic) => {
        const { c: row } = await findCase(t, clinic.id, c.req.valid('param').ref);
        if (row.status === 'delivered') return c.json({ status: 'delivered', changed: false });
        const now = deps.now();
        const [u] = await t
          .update(cases)
          .set({ status: 'delivered', deliveredAt: now, updatedAt: now })
          .where(and(eq(cases.id, row.id), eq(cases.status, 'ready')))
          .returning();
        if (!u)
          throw new ApiError(409, 'case.bad_transition', { from: row.status, to: 'delivered' });
        await recordEvent(t, {
          caseRow: u,
          type: 'status',
          actor: 'clinic',
          payload: { from: 'ready', to: 'delivered' },
        });
        return c.json({ status: 'delivered', changed: true });
      }),
  );

  app.openapi(
    createRoute({
      method: 'post',
      path: '/cases/{ref}/remake',
      tags,
      summary: 'Qayta ishlash so‘rovi (ready|delivered → remake)',
      request: {
        params: refParam,
        body: {
          content: {
            'application/json': {
              schema: z.object({ reason: z.string().trim().max(2000).optional() }).strict(),
            },
          },
          required: false,
        },
      },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t, clinic) => {
        const { c: row, dek } = await findCase(t, clinic.id, c.req.valid('param').ref);
        if (row.status === 'remake') return c.json({ status: 'remake', changed: false });
        if (row.status !== 'ready' && row.status !== 'delivered') {
          throw new ApiError(409, 'case.bad_transition', { from: row.status, to: 'remake' });
        }
        const reason = ((await c.req.json().catch(() => ({}))) as { reason?: string }).reason;
        const now = deps.now();
        const [u] = await t
          .update(cases)
          .set({ status: 'remake', deliveredAt: null, readyAt: null, updatedAt: now })
          .where(eq(cases.id, row.id))
          .returning();
        await recordEvent(t, {
          caseRow: u!,
          type: 'status',
          actor: 'clinic',
          payload: { from: row.status, to: 'remake' },
        });
        if (reason) await addMessage(t, u!, dek, { author: 'clinic', body: reason });
        return c.json({ status: 'remake', changed: true });
      }),
  );

  // --- o'zgarishlar (poll) ----------------------------------------------------
  app.openapi(
    createRoute({
      method: 'get',
      path: '/changes',
      tags,
      summary: 'Kursordan keyingi hodisalar (case_events.seq)',
      request: {
        query: z.object({
          since: z.coerce.number().int().min(0).default(0),
          limit: z.coerce.number().int().min(1).max(500).default(200),
        }),
      },
      responses: OK,
    }),
    async (c) =>
      tx(c, async (t, clinic) => {
        const { since, limit } = c.req.valid('query');
        const rows = await t
          .select({ ev: caseEvents, ref: cases.clinicCaseRef })
          .from(caseEvents)
          .innerJoin(cases, eq(cases.id, caseEvents.caseId))
          .where(and(eq(caseEvents.clinicId, clinic.id), gt(caseEvents.seq, since)))
          .orderBy(asc(caseEvents.seq))
          .limit(limit);
        const msgIds = rows
          .filter((r) => r.ev.type === 'message')
          .map((r) => String(r.ev.payload.messageId));
        const fileIds = rows
          .filter((r) => r.ev.type === 'file')
          .map((r) => String(r.ev.payload.fileId));
        const [msgs, files] = await Promise.all([
          msgIds.length
            ? t.select().from(caseMessages).where(inArray(caseMessages.id, msgIds))
            : [],
          fileIds.length ? t.select().from(caseFiles).where(inArray(caseFiles.id, fileIds)) : [],
        ]);
        const labIds = [...new Set(rows.map((r) => r.ev.labId))];
        const labRows = labIds.length
          ? await t.select().from(labs).where(inArray(labs.id, labIds))
          : [];
        const deks = new Map<string, Key>(labRows.map((l) => [l.id, dekOf(l)]));
        const msgById = new Map(msgs.map((m) => [m.id, m]));
        const fileById = new Map(files.map((f) => [f.id, f]));
        const events = rows.map(({ ev, ref }) => {
          const dek = deks.get(ev.labId)!;
          const m = ev.type === 'message' ? msgById.get(String(ev.payload.messageId)) : undefined;
          const f = ev.type === 'file' ? fileById.get(String(ev.payload.fileId)) : undefined;
          return {
            seq: ev.seq,
            caseRef: ref,
            labId: ev.labId,
            type: ev.type,
            actor: ev.actor,
            payload: ev.payload,
            createdAt: ev.createdAt.toISOString(),
            message: m
              ? {
                  id: m.id,
                  author: m.author,
                  authorName: m.authorName,
                  body: decryptOptional(dek, m.bodyEnc),
                }
              : null,
            file:
              f && !f.deletedAt
                ? {
                    id: f.id,
                    fileName: decryptOptional(dek, f.fileNameEnc),
                    mimeType: f.mimeType,
                    sizeBytes: f.sizeBytes,
                  }
                : null,
          };
        });
        return c.json({ events, nextCursor: rows.at(-1)?.ev.seq ?? since });
      }),
  );

  return app;
};

const linkDto = (l: typeof labClinicLinks.$inferSelect, labName: string) => ({
  id: l.id,
  labId: l.labId,
  labName,
  status: l.status,
  requestedAt: l.requestedAt.toISOString(),
  decidedAt: l.decidedAt?.toISOString() ?? null,
});

/** Faylni deshifrlab qaytaradi (klinika va lab uchun umumiy). */
export const fileResponse = async (
  c: Context,
  t: Tx,
  deps: Deps,
  found: { c: Case; dek: Key },
  fileId: string,
) => {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new ApiError(404, 'file.not_found');
  const f = await t.query.caseFiles.findFirst({
    where: and(
      eq(caseFiles.id, fileId),
      eq(caseFiles.caseId, found.c.id),
      isNull(caseFiles.deletedAt),
    ),
  });
  if (!f) throw new ApiError(404, 'file.not_found');
  const plain = decryptBuffer(found.dek, await deps.storage.get(f.storageKey));
  return new Response(new Uint8Array(plain), {
    headers: {
      'Content-Type': f.mimeType,
      'Content-Length': String(plain.length),
      'Content-Disposition': contentDisposition(
        decryptOptional(found.dek, f.fileNameEnc) ?? 'file',
      ),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
