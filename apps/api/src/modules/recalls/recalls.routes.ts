import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toRecallDto } from './recalls.mapper.ts';
import {
  createRecallSchema,
  listRecallsQuerySchema,
  markContactedSchema,
  patientIdParamSchema,
  recallDtoSchema,
  recallIdParamSchema,
  recallSummaryDtoSchema,
  recallSummaryQuerySchema,
  updateRecallSchema,
} from './recalls.schema.ts';
import { createRecallsService } from './recalls.service.ts';

const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Recall not found',
  },
};

/** Bemor telefoni masklansinmi — `patient.view_pii` (yoki @owner) yo'q bo'lsa HA (patients moduli bilan izchil). */
const shouldMaskPii = (c: {
  get: (k: 'accessClaims') => { perms?: string[] } | undefined;
}): boolean => {
  const perms = c.get('accessClaims')?.perms ?? [];
  return !(perms.includes('@owner') || perms.includes('patient.view_pii'));
};

export const recallRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createRecallsService({ audit: deps.audit });

  // ─── GET /recalls (dashboard) ──────────────────────────────────────────────
  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['recalls'],
    operationId: 'listRecalls',
    middleware: [requirePermission('recall.view')] as const,
    request: { query: listRecallsQuerySchema },
    responses: okJson(z.array(recallDtoSchema), 'Recall list'),
  });
  app.openapi(listRoute, async (c) => {
    const query = c.req.valid('query');
    const rows = await service.list(c, query);
    const mask = shouldMaskPii(c);
    return c.json(ok(rows.map((r) => toRecallDto(r, mask))), 200);
  });

  // ─── GET /recalls/summary (KPI) ───────────────────────────────────────────
  // ⚠️ /summary statik yo'l /{id} param yo'lidan OLDIN ro'yxatdan o'tkazilishi shart.
  const summaryRoute = createRoute({
    method: 'get',
    path: '/summary',
    tags: ['recalls'],
    operationId: 'getRecallSummary',
    middleware: [requirePermission('recall.view')] as const,
    request: { query: recallSummaryQuerySchema },
    responses: okJson(recallSummaryDtoSchema, 'Recall KPI summary'),
  });
  app.openapi(summaryRoute, async (c) => {
    const { branchId } = c.req.valid('query');
    return c.json(ok(await service.summary(c, branchId)), 200);
  });

  // ─── GET /recalls/patient/{id} ─────────────────────────────────────────────
  const listByPatientRoute = createRoute({
    method: 'get',
    path: '/patient/{id}',
    tags: ['recalls'],
    operationId: 'listPatientRecalls',
    middleware: [requirePermission('recall.view')] as const,
    request: { params: patientIdParamSchema },
    responses: okJson(z.array(recallDtoSchema), 'Patient recall list'),
  });
  app.openapi(listByPatientRoute, async (c) => {
    const { id } = c.req.valid('param');
    const rows = await service.listByPatient(c, id);
    const mask = shouldMaskPii(c);
    return c.json(ok(rows.map((r) => toRecallDto(r, mask))), 200);
  });

  // ─── POST /recalls (manual create) ─────────────────────────────────────────
  const createRecallRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['recalls'],
    operationId: 'createRecall',
    middleware: [requirePermission('recall.manage')] as const,
    request: { body: { content: { 'application/json': { schema: createRecallSchema } } } },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(recallDtoSchema) } },
        description: 'Recall created',
      },
      400: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Validation error',
      },
    },
  });
  app.openapi(createRecallRoute, async (c) => {
    const body = c.req.valid('json');
    const created = await service.create(c, body);
    if (!created) return c.json(fail('insert.failed', 'insert.failed'), 400);
    return c.json(ok(toRecallDto(created, shouldMaskPii(c))), 201);
  });

  // ─── PATCH /recalls/{id} ───────────────────────────────────────────────────
  const updateRecallRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['recalls'],
    operationId: 'updateRecall',
    middleware: [requirePermission('recall.manage')] as const,
    request: {
      params: recallIdParamSchema,
      body: { content: { 'application/json': { schema: updateRecallSchema } } },
    },
    responses: { ...okJson(recallDtoSchema, 'Recall updated'), ...notFoundResponse },
  });
  app.openapi(updateRecallRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const updated = await service.update(c, id, body);
    if (!updated) return c.json(fail('not_found', 'not_found'), 404);
    return c.json(ok(toRecallDto(updated, shouldMaskPii(c))), 200);
  });

  // ─── POST /recalls/{id}/contact (mark contacted manually) ──────────────────
  const contactRoute = createRoute({
    method: 'post',
    path: '/{id}/contact',
    tags: ['recalls'],
    operationId: 'markRecallContacted',
    middleware: [requirePermission('recall.manage')] as const,
    request: {
      params: recallIdParamSchema,
      body: { content: { 'application/json': { schema: markContactedSchema } } },
    },
    responses: { ...okJson(recallDtoSchema, 'Recall marked contacted'), ...notFoundResponse },
  });
  app.openapi(contactRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const updated = await service.markContacted(c, id, body);
    if (!updated) return c.json(fail('not_found', 'not_found'), 404);
    return c.json(ok(toRecallDto(updated, shouldMaskPii(c))), 200);
  });

  return app;
};
