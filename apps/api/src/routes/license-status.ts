import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { db } from '../db/client.ts';
import {
  getLicenseState as defaultGetLicenseState,
  invalidateLicense,
  type LicenseState,
  readAnchor,
  readLicense,
  writeAnchor,
  writeLicense,
} from '../lib/license.ts';
import { sendHeartbeat } from '../lib/license-client.ts';
import { runLicenseHeartbeatCheck } from '../lib/license-heartbeat-scheduler.ts';
import { logger } from '../lib/logger.ts';
import { apiResponseSchema, errorResponseSchema } from '../lib/openapi.ts';
import { rateLimit } from '../lib/rate-limit.ts';
import {
  getTenantSubscriptionState,
  invalidateSubscriptionCache,
  tenantIdFromBearer,
} from '../lib/subscription.ts';
import { isSaasSupervisorEnabled, syncTenantSubscription } from '../lib/supervisor-saas.ts';

export const licenseStatusResponseSchema = z
  .object({
    state: z.enum(['none', 'active', 'expiring', 'grace', 'expired']),
    expiresAt: z.string().nullable(),
    graceEndsAt: z.string().nullable(),
    daysLeft: z.number().int().nullable(),
    mode: z.enum(['desktop', 'cloud']),
  })
  .openapi('LicenseStatus');

const NO_LICENSE: LicenseState = {
  state: 'none',
  expiresAt: null,
  graceEndsAt: null,
  daysLeft: null,
};

/**
 * `GET /api/license/status` + `POST /api/license/recheck` (P18).
 *
 * Auth YO'Q (blok paytida login ham yopiq bo'lishi mumkin — web blok ekranini
 * ko'rsatishi uchun) va global blokdan ochiq (license-middleware.ts).
 * Cloud rejimida (`DENTAL_LOCAL_DESKTOP !== 'true'`) status `none` + `mode:'cloud'`,
 * recheck 404 — web hech narsa ko'rsatmaydi.
 *
 * `getLicenseState` / `runHeartbeat` injectable — test uchun.
 */
export const licenseStatusRoutes = (
  deps: {
    getLicenseState?: () => Promise<LicenseState>;
    runHeartbeat?: () => Promise<void>;
    isDesktop?: () => boolean;
    /** L8 (bulut): tenant obuna holati / Supervisor'dan darhol sinxron — testda inject. */
    getSubscriptionState?: (tenantId: string) => Promise<LicenseState>;
    syncSubscription?: (tenantId: string) => Promise<boolean>;
  } = {},
) => {
  const getState = deps.getLicenseState ?? defaultGetLicenseState;
  const isDesktop = deps.isDesktop ?? (() => process.env.DENTAL_LOCAL_DESKTOP === 'true');
  const getSubState = deps.getSubscriptionState ?? getTenantSubscriptionState;
  const syncSub =
    deps.syncSubscription ??
    ((tenantId: string) => {
      invalidateSubscriptionCache(tenantId);
      return syncTenantSubscription(db, tenantId);
    });
  const runHeartbeat =
    deps.runHeartbeat ??
    (() =>
      runLicenseHeartbeatCheck({
        readLicense,
        writeLicense,
        invalidateLicense,
        sendHeartbeat,
        readAnchor,
        writeAnchor,
        log: logger,
      }));
  const app = new OpenAPIHono();
  // 6/daqiqa per IP — heartbeat tashqi so'rov (Supervisor) yuboradi.
  const recheckRateLimit = rateLimit({ name: 'license-recheck', limit: 6, windowSeconds: 60 });

  const statusRoute = createRoute({
    method: 'get',
    path: '/status',
    tags: ['license'],
    operationId: 'getLicenseStatus',
    responses: {
      200: {
        content: { 'application/json': { schema: apiResponseSchema(licenseStatusResponseSchema) } },
        description: 'Local license state (desktop) or none (cloud)',
      },
    },
  });

  app.openapi(statusRoute, async (c) => {
    if (!isDesktop()) {
      // L8: SaaS — Bearer bo'lsa tenant obunasi (P18 bilan bir xil holat/banner);
      // bo'lmasa (login oldidan) eski `none`.
      const tenantId = await tenantIdFromBearer(c);
      const state = tenantId ? await getSubState(tenantId) : NO_LICENSE;
      return c.json(ok({ ...state, mode: 'cloud' as const }), 200);
    }
    return c.json(ok({ ...(await getState()), mode: 'desktop' as const }), 200);
  });

  const recheckRoute = createRoute({
    method: 'post',
    path: '/recheck',
    tags: ['license'],
    operationId: 'recheckLicense',
    middleware: [recheckRateLimit] as const,
    responses: {
      200: {
        content: { 'application/json': { schema: apiResponseSchema(licenseStatusResponseSchema) } },
        description: 'Heartbeat run immediately; refreshed license state',
      },
      404: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Not available outside Local Desktop / SaaS subscription mode',
      },
    },
  });

  app.openapi(recheckRoute, async (c) => {
    if (!isDesktop()) {
      // L8: SaaS — blok ekranidagi «Qayta tekshirish» Supervisor'dan muddatni
      // darhol oladi. Token yo'q / integratsiya o'chiq → avvalgidek 404.
      const tenantId = isSaasSupervisorEnabled() ? await tenantIdFromBearer(c) : null;
      if (!tenantId) return c.json(fail('NOT_FOUND', 'Not found'), 404);
      try {
        await syncSub(tenantId);
      } catch (err) {
        // Supervisor yetib bo'lmaydi — joriy (saqlangan) holat qaytadi.
        logger.warn({ err, tenantId }, 'subscription recheck failed');
      }
      return c.json(ok({ ...(await getSubState(tenantId)), mode: 'cloud' as const }), 200);
    }
    await runHeartbeat();
    return c.json(ok({ ...(await getState()), mode: 'desktop' as const }), 200);
  });

  return app;
};
