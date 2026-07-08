import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { CrossEntityError } from '../../lib/ownership.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requireFeature } from '../../middleware/require-feature.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toLabOrderDto } from './lab-orders.mapper.ts';
import {
  createLabOrderSchema,
  labOrderDtoSchema,
  labOrderIdParamSchema,
  labOrderListResponseDtoSchema,
  listLabOrdersQuerySchema,
  updateLabOrderSchema,
} from './lab-orders.schema.ts';
import { createLabOrdersService } from './lab-orders.service.ts';
import { InvalidLabOrderTransitionError } from './lab-orders.transitions.ts';

/** Standart 404 response — get/patch endpoint'lar uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Lab order not found',
  },
};

export const labOrdersRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', requireModuleInDesktop('lab-orders'));
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createLabOrdersService(deps);

  // ─── GET / — list ────────────────────────────────────────────────────────────

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['lab-orders'],
    operationId: 'listLabOrders',
    middleware: [requirePermission('lab_order.view'), requireFeature('labOrders')] as const,
    request: {
      query: listLabOrdersQuerySchema,
    },
    responses: okJson(
      labOrderListResponseDtoSchema,
      'Paginated lab orders (tenant-wide or patient-filtered)',
    ),
  });

  app.openapi(listRoute, async (c) => {
    const query = c.req.valid('query');
    const { data, meta } = await service.list(c, query);
    return c.json(ok({ data: data.map(toLabOrderDto), meta }), 200);
  });

  // ─── GET /overdue — muddati o'tgan buyurtmalar (V3-5) ───────────────────────
  const overdueRoute = createRoute({
    method: 'get',
    path: '/overdue',
    tags: ['lab-orders'],
    operationId: 'listOverdueLabOrders',
    middleware: [requirePermission('lab_order.view'), requireFeature('labOrders')] as const,
    responses: okJson(z.array(labOrderDtoSchema), 'Overdue lab orders'),
  });

  app.openapi(overdueRoute, async (c) => {
    const rows = await service.overdue(c);
    return c.json(ok(rows.map(toLabOrderDto)), 200);
  });

  // ─── POST / — create ─────────────────────────────────────────────────────────

  const createRoute_ = createRoute({
    method: 'post',
    path: '/',
    tags: ['lab-orders'],
    operationId: 'createLabOrder',
    middleware: [requirePermission('lab_order.manage'), requireFeature('labOrders')] as const,
    request: {
      body: { content: { 'application/json': { schema: createLabOrderSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(labOrderDtoSchema) } },
        description: 'Lab order created',
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

  app.openapi(createRoute_, async (c) => {
    const body = c.req.valid('json');
    try {
      const row = await service.create(c, body);
      if (!row) throw new Error('Lab order creation failed');
      return c.json(ok(toLabOrderDto(row)), 201);
    } catch (e) {
      // L12: cross-entity ownership mismatch → 400 (noto'g'ri havola, resource emas).
      if (e instanceof CrossEntityError) {
        return c.json(fail(`ownership.${e.reason}`, e.message), 400);
      }
      throw e;
    }
  });

  // ─── GET /{id} — get by id ────────────────────────────────────────────────────

  const getRoute = createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['lab-orders'],
    operationId: 'getLabOrder',
    middleware: [requirePermission('lab_order.view'), requireFeature('labOrders')] as const,
    request: {
      params: labOrderIdParamSchema,
    },
    responses: { ...okJson(labOrderDtoSchema, 'Lab order'), ...notFoundResponse },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.get(c, id);
    if (!row) return c.json(fail('lab_order.not_found', 'Not found'), 404);
    return c.json(ok(toLabOrderDto(row)), 200);
  });

  // ─── PATCH /{id} — update ─────────────────────────────────────────────────────

  const updateRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['lab-orders'],
    operationId: 'updateLabOrder',
    middleware: [requirePermission('lab_order.manage'), requireFeature('labOrders')] as const,
    request: {
      params: labOrderIdParamSchema,
      body: { content: { 'application/json': { schema: updateLabOrderSchema } } },
    },
    responses: {
      ...okJson(labOrderDtoSchema, 'Updated lab order'),
      400: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Invalid status transition',
      },
      ...notFoundResponse,
    },
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    try {
      const row = await service.update(c, id, body);
      if (!row) return c.json(fail('lab_order.not_found', 'Not found'), 404);
      return c.json(ok(toLabOrderDto(row)), 200);
    } catch (e) {
      // CLI-439 B2: noto'g'ri status o'tishi (masalan delivered→draft) → 400.
      if (e instanceof InvalidLabOrderTransitionError) {
        return c.json(fail('lab_order.invalid_transition', e.message), 400);
      }
      throw e;
    }
  });

  return app;
};
