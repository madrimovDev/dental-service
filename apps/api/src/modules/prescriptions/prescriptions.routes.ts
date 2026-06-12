import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toPrescriptionDto } from './prescriptions.mapper.ts';
import {
  createPrescriptionSchema,
  listPrescriptionsQuerySchema,
  prescriptionDeleteResultSchema,
  prescriptionDtoSchema,
  prescriptionIdParamSchema,
  updatePrescriptionSchema,
} from './prescriptions.schema.ts';
import { createPrescriptionsService } from './prescriptions.service.ts';

/** Standart 404 response — get / patch / delete endpoint'lar uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Prescription not found',
  },
};

export const prescriptionsRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createPrescriptionsService(deps);

  // ─── GET / — list ────────────────────────────────────────────────────────

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['prescriptions'],
    operationId: 'listPrescriptions',
    middleware: [requirePermission('prescription.view')] as const,
    request: {
      query: listPrescriptionsQuerySchema,
    },
    responses: okJson(z.array(prescriptionDtoSchema), 'List of prescriptions'),
  });

  app.openapi(listRoute, async (c) => {
    const { patientId } = c.req.valid('query');
    const rows = await service.list(c, patientId);
    return c.json(ok(rows.map(toPrescriptionDto)), 200);
  });

  // ─── POST / — create ─────────────────────────────────────────────────────

  const createPrescriptionRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['prescriptions'],
    operationId: 'createPrescription',
    middleware: [requirePermission('prescription.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createPrescriptionSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(prescriptionDtoSchema) } },
        description: 'Prescription created',
      },
      400: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Validation error',
      },
      401: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Unauthorized',
      },
      403: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Forbidden',
      },
    },
  });

  app.openapi(createPrescriptionRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.create(c, body);
    if (!row) throw new Error('Prescription creation failed');
    return c.json(ok(toPrescriptionDto(row)), 201);
  });

  // ─── GET /{id} — get by id ───────────────────────────────────────────────

  const getRoute = createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['prescriptions'],
    operationId: 'getPrescription',
    middleware: [requirePermission('prescription.view')] as const,
    request: {
      params: prescriptionIdParamSchema,
    },
    responses: { ...okJson(prescriptionDtoSchema, 'Prescription'), ...notFoundResponse },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.get(c, id);
    if (!row) return c.json(fail('prescription.not_found', 'Not found'), 404);
    return c.json(ok(toPrescriptionDto(row)), 200);
  });

  // ─── PATCH /{id} — update ────────────────────────────────────────────────

  const updateRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['prescriptions'],
    operationId: 'updatePrescription',
    middleware: [requirePermission('prescription.manage')] as const,
    request: {
      params: prescriptionIdParamSchema,
      body: { content: { 'application/json': { schema: updatePrescriptionSchema } } },
    },
    responses: { ...okJson(prescriptionDtoSchema, 'Updated prescription'), ...notFoundResponse },
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.update(c, id, body);
    if (!row) return c.json(fail('prescription.not_found', 'Not found'), 404);
    return c.json(ok(toPrescriptionDto(row)), 200);
  });

  // ─── DELETE /{id} — delete ───────────────────────────────────────────────

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['prescriptions'],
    operationId: 'deletePrescription',
    middleware: [requirePermission('prescription.manage')] as const,
    request: {
      params: prescriptionIdParamSchema,
    },
    responses: {
      ...okJson(prescriptionDeleteResultSchema, 'Prescription deleted'),
      ...notFoundResponse,
    },
  });

  app.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.remove(c, id);
    if (!row) return c.json(fail('prescription.not_found', 'Not found'), 404);
    return c.json(ok({ deleted: true as const }), 200);
  });

  return app;
};
