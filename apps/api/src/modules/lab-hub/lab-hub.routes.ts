import { fail, ok } from '@dental/core';
import { type LabHubCachedLab, labHubOutbox, labHubState } from '@dental/db-schema';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { count, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import type { Database } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { encryptSecret } from '../../lib/crypto.ts';
import { isLabHubConfigured, LabHubError, labHubClient } from '../../lib/lab-hub/client.ts';
import {
  hubKeyOf,
  isDesktopMode,
  readLabHubState,
  resolveConnectProof,
} from '../../lib/lab-hub/state.ts';
import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';

/**
 * `/api/lab-hub/*` — klinikaning Lab Hub'ga ulanishi (Sozlamalar → «Laboratoriyalar»).
 * Hub'ga faqat chiquvchi so'rov (8 s timeout). Hub xatolari klientga 401 sifatida
 * QAYTARILMAYDI (web klienti 401'da sessiyani yangilaydi) — 409/503 + kod.
 */
const statusSchema = z
  .object({
    configured: z.boolean(),
    mode: z.enum(['desktop', 'saas']),
    connected: z.boolean(),
    hubClinicId: z.string().nullable(),
    connectedAt: z.string().nullable(),
    lastPollAt: z.string().nullable(),
    lastPushAt: z.string().nullable(),
    lastError: z.string().nullable(),
    pendingOutbox: z.number().int(),
    failedOutbox: z.number().int(),
  })
  .openapi('LabHubStatus');

const labSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string().nullable(),
  description: z.string().nullable(),
  linkStatus: z.string().nullable(),
});

const labsSchema = z
  .object({ labs: z.array(labSchema), stale: z.boolean() })
  .openapi('LabHubCatalog');

const linkSchema = z
  .object({
    link: z.object({
      id: z.string(),
      labId: z.string(),
      labName: z.string(),
      status: z.string(),
      requestedAt: z.string(),
      decidedAt: z.string().nullable(),
    }),
  })
  .openapi('LabHubLink');

const errors = {
  400: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Bad request',
  },
  409: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Not connected / Hub rejected',
  },
  503: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Lab Hub unreachable',
  },
};

const hubErrorResponse = (c: Context, err: unknown) => {
  if (err instanceof LabHubError) {
    if (err.status === 0 && err.code === 'lab_hub.not_configured') {
      return c.json(fail(err.code, err.code), 409);
    }
    if (err.status === 0 || err.status >= 500 || err.code === 'supervisor.unavailable') {
      return c.json(fail('lab_hub.unreachable', err.code), 503);
    }
    if (err.status === 400 && err.code.startsWith('lab_hub.')) {
      return c.json(fail(err.code, err.code), 400);
    }
    return c.json(fail(err.code, err.code), 409);
  }
  throw err;
};

export const labHubRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', requireModuleInDesktop('lab-orders'));
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

  // ─── GET /status ────────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: 'get',
      path: '/status',
      tags: ['lab-hub'],
      operationId: 'getLabHubStatus',
      middleware: [requirePermission('lab_order.view')] as const,
      responses: okJson(statusSchema, 'Lab Hub connection status'),
    }),
    async (c) => {
      const db = getDb(c);
      const state = await readLabHubState(db);
      const counts = await db
        .select({ status: labHubOutbox.status, n: count() })
        .from(labHubOutbox)
        .groupBy(labHubOutbox.status);
      const n = (s: string) => counts.find((r) => r.status === s)?.n ?? 0;
      return c.json(
        ok({
          configured: isLabHubConfigured(),
          mode: isDesktopMode() ? ('desktop' as const) : ('saas' as const),
          connected: !!state?.hubKeyEnc,
          hubClinicId: state?.hubClinicId ?? null,
          connectedAt: iso(state?.connectedAt),
          lastPollAt: iso(state?.lastPollAt),
          lastPushAt: iso(state?.lastPushAt),
          lastError: state?.lastError ?? null,
          pendingOutbox: n('pending'),
          failedOutbox: n('failed'),
        }),
        200,
      );
    },
  );

  // ─── POST /connect ──────────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: 'post',
      path: '/connect',
      tags: ['lab-hub'],
      operationId: 'connectLabHub',
      middleware: [requirePermission('tenant_settings.edit')] as const,
      responses: {
        ...okJson(
          z.object({ connected: z.literal(true), hubClinicId: z.string() }),
          'Connected (hub key stored encrypted)',
        ),
        ...errors,
      },
    }),
    async (c) => {
      const db = getDb(c);
      const tenantId = c.get('activeTenantId') as string;
      try {
        const proof = await resolveConnectProof(db);
        const res = await labHubClient().connect(proof);
        const now = new Date();
        const values = {
          hubClinicId: res.clinicId,
          hubKeyEnc: encryptSecret(res.hubKey),
          connectedAt: now,
          lastError: null,
          updatedAt: now,
        };
        await db
          .insert(labHubState)
          .values({ tenantId, ...values })
          .onConflictDoUpdate({ target: labHubState.tenantId, set: values });
        await deps.audit.record(c, {
          action: 'connected',
          resourceType: 'lab_hub',
          resourceId: null,
          after: { hubClinicId: res.clinicId, mode: isDesktopMode() ? 'desktop' : 'saas' },
        });
        return c.json(ok({ connected: true as const, hubClinicId: res.clinicId }), 200);
      } catch (err) {
        return hubErrorResponse(c, err);
      }
    },
  );

  // ─── GET /labs — katalog (internet yo'q bo'lsa — oxirgi kesh) ───────────────
  app.openapi(
    createRoute({
      method: 'get',
      path: '/labs',
      tags: ['lab-hub'],
      operationId: 'listLabHubLabs',
      middleware: [requirePermission('lab_order.view')] as const,
      responses: { ...okJson(labsSchema, 'Lab catalog with link status'), ...errors },
    }),
    async (c) => {
      const db = getDb(c);
      const state = await readLabHubState(db);
      const key = hubKeyOf(state);
      if (!state || !key) return c.json(fail('lab_hub.not_connected', 'Not connected'), 409);
      try {
        const { labs } = await labHubClient().listLabs(key);
        const cache: LabHubCachedLab[] = labs.map((l) => ({
          id: l.id,
          name: l.name,
          city: l.city ?? null,
          description: l.description ?? null,
          linkStatus: l.linkStatus ?? null,
        }));
        await db
          .update(labHubState)
          .set({ labsCache: cache, updatedAt: new Date() })
          .where(eq(labHubState.id, state.id));
        return c.json(ok({ labs: cache, stale: false }), 200);
      } catch (err) {
        if (err instanceof LabHubError && (err.status === 0 || err.status >= 500)) {
          return c.json(ok({ labs: state.labsCache ?? [], stale: true }), 200);
        }
        return hubErrorResponse(c, err);
      }
    },
  );

  // ─── POST /links — ulanish so'rovi ─────────────────────────────────────────
  app.openapi(
    createRoute({
      method: 'post',
      path: '/links',
      tags: ['lab-hub'],
      operationId: 'requestLabHubLink',
      middleware: [requirePermission('tenant_settings.edit')] as const,
      request: {
        body: {
          content: { 'application/json': { schema: z.object({ labId: z.uuid() }).strict() } },
        },
      },
      responses: {
        200: {
          content: { 'application/json': { schema: apiResponseSchema(linkSchema) } },
          description: 'Link requested',
        },
        ...errors,
      },
    }),
    async (c) => {
      const db = getDb(c);
      const { labId } = c.req.valid('json');
      const state = await readLabHubState(db);
      const key = hubKeyOf(state);
      if (!state || !key) return c.json(fail('lab_hub.not_connected', 'Not connected'), 409);
      try {
        const { link } = await labHubClient().requestLink(key, labId);
        const cache = (state.labsCache ?? []).map((l) =>
          l.id === labId ? { ...l, linkStatus: link.status } : l,
        );
        await db
          .update(labHubState)
          .set({ labsCache: cache, updatedAt: new Date() })
          .where(eq(labHubState.id, state.id));
        await deps.audit.record(c, {
          action: 'link_requested',
          resourceType: 'lab_hub',
          resourceId: null,
          after: { labId, labName: link.labName, status: link.status },
        });
        return c.json(ok({ link }), 200);
      } catch (err) {
        return hubErrorResponse(c, err);
      }
    },
  );

  return app;
};
