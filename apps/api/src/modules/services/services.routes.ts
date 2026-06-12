import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toServiceDto, toServicePriceDto, toServiceWithPricesDto } from './services.mapper.ts';
import {
  createServiceSchema,
  serviceDeleteResultSchema,
  serviceDtoSchema,
  serviceIdParamSchema,
  servicePriceDtoSchema,
  serviceWithPricesDtoSchema,
  setServicePriceSchema,
  updateServiceSchema,
} from './services.schema.ts';
import { createServicesService } from './services.service.ts';

/** Standart 404 response — get / patch / delete endpoint'lar uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Service not found',
  },
};

export const serviceRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createServicesService({ audit: deps.audit });

  // ─── GET / — list ─────────────────────────────────────────────────────────

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['services'],
    operationId: 'listServices',
    middleware: [requirePermission('service.view')] as const,
    responses: okJson(z.array(serviceDtoSchema), 'List of services'),
  });

  app.openapi(listRoute, async (c) => {
    const rows = await service.list(c);
    return c.json(ok(rows.map(toServiceDto)), 200);
  });

  // ─── POST / — create ──────────────────────────────────────────────────────

  const createServiceRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['services'],
    operationId: 'createService',
    middleware: [requirePermission('service.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createServiceSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(serviceDtoSchema) } },
        description: 'Service created',
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

  app.openapi(createServiceRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.create(c, body);
    return c.json(ok(toServiceDto(row)), 201);
  });

  // ─── GET /{id} — get by id ────────────────────────────────────────────────

  const getRoute = createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['services'],
    operationId: 'getService',
    middleware: [requirePermission('service.view')] as const,
    request: {
      params: serviceIdParamSchema,
    },
    responses: {
      ...okJson(serviceWithPricesDtoSchema, 'Service with prices'),
      ...notFoundResponse,
    },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.findById(c, id);
    if (!result) return c.json(fail('service.not_found', 'Service not found'), 404);
    const { prices, ...row } = result;
    return c.json(ok(toServiceWithPricesDto(row, prices)), 200);
  });

  // ─── PATCH /{id} — update ─────────────────────────────────────────────────

  const updateRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['services'],
    operationId: 'updateService',
    middleware: [requirePermission('service.manage')] as const,
    request: {
      params: serviceIdParamSchema,
      body: { content: { 'application/json': { schema: updateServiceSchema } } },
    },
    responses: { ...okJson(serviceDtoSchema, 'Updated service'), ...notFoundResponse },
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.update(c, id, body);
    if (!row) return c.json(fail('service.not_found', 'Service not found'), 404);
    return c.json(ok(toServiceDto(row)), 200);
  });

  // ─── DELETE /{id} — soft delete ───────────────────────────────────────────

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['services'],
    operationId: 'deleteService',
    middleware: [requirePermission('service.manage')] as const,
    request: {
      params: serviceIdParamSchema,
    },
    responses: {
      ...okJson(serviceDeleteResultSchema, 'Service deleted'),
      ...notFoundResponse,
    },
  });

  app.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.remove(c, id);
    if (!row) return c.json(fail('service.not_found', 'Service not found'), 404);
    return c.json(ok({ deleted: true as const }), 200);
  });

  // ─── POST /{id}/prices — set price ────────────────────────────────────────

  const setPriceRoute = createRoute({
    method: 'post',
    path: '/{id}/prices',
    tags: ['services'],
    operationId: 'setServicePrice',
    middleware: [requirePermission('service.manage')] as const,
    request: {
      params: serviceIdParamSchema,
      body: { content: { 'application/json': { schema: setServicePriceSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(servicePriceDtoSchema) } },
        description: 'Service price set',
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

  app.openapi(setPriceRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.setPrice(c, id, body);
    if (!row) throw new Error('Service price insert failed');
    return c.json(ok(toServicePriceDto(row)), 201);
  });

  return app;
};
