import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import type { NotificationsService } from '../notifications/notifications.service.ts';
import {
  toServiceMaterialDto,
  toStockBatchDto,
  toStockItemDto,
  toStockItemWithLowStockDto,
  toStockMovementDto,
} from './stock.mapper.ts';
import {
  batchesQuerySchema,
  bomQuerySchema,
  createBatchSchema,
  createBomSchema,
  createItemSchema,
  createMovementSchema,
  expiringQuerySchema,
  listItemsQuerySchema,
  movementsQuerySchema,
  serviceMaterialDtoSchema,
  stockBatchDtoSchema,
  stockBomDeleteResultSchema,
  stockIdParamSchema,
  stockItemDtoSchema,
  stockItemWithLowStockDtoSchema,
  stockMovementDtoSchema,
  updateItemSchema,
} from './stock.schema.ts';
import { createStockService, InsufficientStockError } from './stock.service.ts';

/** Standart 404 — get / patch / delete endpoint'lar uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Not found',
  },
};

/** Create (201) + standart 4xx — okJson (200) o'rniga. */
const createdResponses = <T extends z.ZodTypeAny>(schema: T, description: string) => ({
  201: {
    content: { 'application/json': { schema: apiResponseSchema(schema) } },
    description,
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
});

/**
 * Ombor routes:
 *   /api/stock/items     (CRUD — view/manage)
 *   /api/stock/movements (POST manage, GET item bo'yicha view)
 *   /api/stock/bom       (CRUD manage — service→material normalari)
 */
export const stockRoutes = (deps: {
  db: Database;
  audit: AuditLogger;
  notifications?: NotificationsService;
}) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createStockService({ audit: deps.audit, notifications: deps.notifications });

  // ===== Items =====
  const listItemsRoute = createRoute({
    method: 'get',
    path: '/items',
    tags: ['stock'],
    operationId: 'listStockItems',
    middleware: [requirePermission('stock.view')] as const,
    request: { query: listItemsQuerySchema },
    responses: okJson(z.array(stockItemWithLowStockDtoSchema), 'List of stock items'),
  });

  app.openapi(listItemsRoute, async (c) => {
    const query = c.req.valid('query');
    const rows = await service.listItems(c, query);
    return c.json(ok(rows.map(toStockItemWithLowStockDto)), 200);
  });

  const createItemRoute = createRoute({
    method: 'post',
    path: '/items',
    tags: ['stock'],
    operationId: 'createStockItem',
    middleware: [requirePermission('stock.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createItemSchema } } },
    },
    responses: createdResponses(stockItemDtoSchema, 'Stock item created'),
  });

  app.openapi(createItemRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.createItem(c, body);
    if (!row) throw new Error('Stock item creation failed');
    return c.json(ok(toStockItemDto(row)), 201);
  });

  const getItemRoute = createRoute({
    method: 'get',
    path: '/items/{id}',
    tags: ['stock'],
    operationId: 'getStockItem',
    middleware: [requirePermission('stock.view')] as const,
    request: { params: stockIdParamSchema },
    responses: { ...okJson(stockItemWithLowStockDtoSchema, 'Stock item'), ...notFoundResponse },
  });

  app.openapi(getItemRoute, async (c) => {
    const { id } = c.req.valid('param');
    const item = await service.getItem(c, id);
    if (!item) return c.json(fail('item.not_found', 'Stock item not found'), 404);
    return c.json(ok(toStockItemWithLowStockDto(item)), 200);
  });

  const updateItemRoute = createRoute({
    method: 'patch',
    path: '/items/{id}',
    tags: ['stock'],
    operationId: 'updateStockItem',
    middleware: [requirePermission('stock.manage')] as const,
    request: {
      params: stockIdParamSchema,
      body: { content: { 'application/json': { schema: updateItemSchema } } },
    },
    responses: { ...okJson(stockItemDtoSchema, 'Updated stock item'), ...notFoundResponse },
  });

  app.openapi(updateItemRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const item = await service.updateItem(c, id, body);
    if (!item) return c.json(fail('item.not_found', 'Stock item not found'), 404);
    return c.json(ok(toStockItemDto(item)), 200);
  });

  // ===== Movements =====
  const listMovementsRoute = createRoute({
    method: 'get',
    path: '/movements',
    tags: ['stock'],
    operationId: 'listStockMovements',
    middleware: [requirePermission('stock.view')] as const,
    request: { query: movementsQuerySchema },
    responses: okJson(z.array(stockMovementDtoSchema), 'List of stock movements'),
  });

  app.openapi(listMovementsRoute, async (c) => {
    const { itemId } = c.req.valid('query');
    const rows = await service.listMovements(c, itemId);
    return c.json(ok(rows.map(toStockMovementDto)), 200);
  });

  const createMovementRoute = createRoute({
    method: 'post',
    path: '/movements',
    tags: ['stock'],
    operationId: 'createStockMovement',
    middleware: [requirePermission('stock.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createMovementSchema } } },
    },
    responses: {
      ...createdResponses(stockMovementDtoSchema, 'Stock movement created'),
      409: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Insufficient stock (negative guard)',
      },
    },
  });

  app.openapi(createMovementRoute, async (c) => {
    const body = c.req.valid('json');
    try {
      const movement = await service.createMovement(c, body);
      if (!movement) throw new Error('Stock movement creation failed');
      return c.json(ok(toStockMovementDto(movement)), 201);
    } catch (err) {
      if (err instanceof InsufficientStockError) {
        return c.json(
          fail('stock.insufficient', 'Insufficient stock for this movement', {
            available: err.available,
            requested: err.requested,
          }),
          409,
        );
      }
      throw err;
    }
  });

  // ===== BOM =====
  const listBomRoute = createRoute({
    method: 'get',
    path: '/bom',
    tags: ['stock'],
    operationId: 'listStockBom',
    middleware: [requirePermission('stock.view')] as const,
    request: { query: bomQuerySchema },
    responses: okJson(z.array(serviceMaterialDtoSchema), 'List of service materials (BOM)'),
  });

  app.openapi(listBomRoute, async (c) => {
    const { serviceId } = c.req.valid('query');
    const rows = await service.listBom(c, serviceId);
    return c.json(ok(rows.map(toServiceMaterialDto)), 200);
  });

  const createBomRoute = createRoute({
    method: 'post',
    path: '/bom',
    tags: ['stock'],
    operationId: 'createStockBom',
    middleware: [requirePermission('stock.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createBomSchema } } },
    },
    responses: createdResponses(serviceMaterialDtoSchema, 'Service material (BOM) created'),
  });

  app.openapi(createBomRoute, async (c) => {
    const body = c.req.valid('json');
    const bom = await service.createBom(c, body);
    if (!bom) throw new Error('BOM creation failed');
    return c.json(ok(toServiceMaterialDto(bom)), 201);
  });

  const removeBomRoute = createRoute({
    method: 'delete',
    path: '/bom/{id}',
    tags: ['stock'],
    operationId: 'removeStockBom',
    middleware: [requirePermission('stock.manage')] as const,
    request: { params: stockIdParamSchema },
    responses: { ...okJson(stockBomDeleteResultSchema, 'BOM removed'), ...notFoundResponse },
  });

  app.openapi(removeBomRoute, async (c) => {
    const { id } = c.req.valid('param');
    const bom = await service.removeBom(c, id);
    if (!bom) return c.json(fail('bom.not_found', 'BOM not found'), 404);
    return c.json(ok({ deleted: true as const }), 200);
  });

  // ===== Batches (V2-2) =====
  const listBatchesRoute = createRoute({
    method: 'get',
    path: '/batches',
    tags: ['stock'],
    operationId: 'listStockBatches',
    middleware: [requirePermission('stock.view')] as const,
    request: { query: batchesQuerySchema },
    responses: okJson(z.array(stockBatchDtoSchema), 'List of stock batches for an item'),
  });

  app.openapi(listBatchesRoute, async (c) => {
    const { itemId } = c.req.valid('query');
    const rows = await service.listBatches(c, itemId);
    return c.json(ok(rows.map(toStockBatchDto)), 200);
  });

  const expiringBatchesRoute = createRoute({
    method: 'get',
    path: '/batches/expiring',
    tags: ['stock'],
    operationId: 'listExpiringStockBatches',
    middleware: [requirePermission('stock.view')] as const,
    request: { query: expiringQuerySchema },
    responses: okJson(z.array(stockBatchDtoSchema), 'Batches expiring within N days'),
  });

  app.openapi(expiringBatchesRoute, async (c) => {
    const { withinDays } = c.req.valid('query');
    const rows = await service.expiringBatches(c, withinDays);
    return c.json(ok(rows.map(toStockBatchDto)), 200);
  });

  const createBatchRoute = createRoute({
    method: 'post',
    path: '/batches',
    tags: ['stock'],
    operationId: 'createStockBatch',
    middleware: [requirePermission('stock.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createBatchSchema } } },
    },
    responses: createdResponses(stockBatchDtoSchema, 'Stock batch received'),
  });

  app.openapi(createBatchRoute, async (c) => {
    const body = c.req.valid('json');
    const batch = await service.createBatch(c, body);
    if (!batch) throw new Error('Batch creation failed');
    return c.json(ok(toStockBatchDto(batch)), 201);
  });

  return app;
};
