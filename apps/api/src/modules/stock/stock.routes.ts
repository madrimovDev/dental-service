import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  createBomSchema,
  createItemSchema,
  createMovementSchema,
  listItemsQuerySchema,
  updateItemSchema,
} from './stock.schema.ts';
import { createStockService } from './stock.service.ts';

/**
 * Ombor routes:
 *   /api/stock/items     (CRUD — view/manage)
 *   /api/stock/movements (POST manage, GET item bo'yicha view)
 *   /api/stock/bom       (CRUD manage — service→material normalari)
 */
export const stockRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createStockService({ audit: deps.audit });

  // ===== Items =====
  app.get('/items', requirePermission('stock.view'), async (c) => {
    const query = listItemsQuerySchema.safeParse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    if (!query.success) throw new HTTPException(400, { message: 'Invalid query' });
    return c.json(ok(await service.listItems(c, query.data)));
  });

  app.post('/items', requirePermission('stock.manage'), async (c) => {
    const body = createItemSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    return c.json(ok(await service.createItem(c, body.data)), 201);
  });

  app.get('/items/:id', requirePermission('stock.view'), async (c) => {
    const item = await service.getItem(c, c.req.param('id'));
    if (!item) return c.json(fail('item.not_found', 'Stock item not found'), 404);
    return c.json(ok(item));
  });

  app.patch('/items/:id', requirePermission('stock.manage'), async (c) => {
    const body = updateItemSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const item = await service.updateItem(c, c.req.param('id'), body.data);
    if (!item) return c.json(fail('item.not_found', 'Stock item not found'), 404);
    return c.json(ok(item));
  });

  // ===== Movements =====
  app.get('/movements', requirePermission('stock.view'), async (c) => {
    const itemId = c.req.query('itemId');
    if (!itemId) return c.json(fail('query.missing', 'itemId required'), 400);
    return c.json(ok(await service.listMovements(c, itemId)));
  });

  app.post('/movements', requirePermission('stock.manage'), async (c) => {
    const body = createMovementSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    return c.json(ok(await service.createMovement(c, body.data)), 201);
  });

  // ===== BOM =====
  app.get('/bom', requirePermission('stock.view'), async (c) => {
    const serviceId = c.req.query('serviceId') ?? undefined;
    return c.json(ok(await service.listBom(c, serviceId)));
  });

  app.post('/bom', requirePermission('stock.manage'), async (c) => {
    const body = createBomSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    return c.json(ok(await service.createBom(c, body.data)), 201);
  });

  app.delete('/bom/:id', requirePermission('stock.manage'), async (c) => {
    const bom = await service.removeBom(c, c.req.param('id'));
    if (!bom) return c.json(fail('bom.not_found', 'BOM not found'), 404);
    return c.json(ok(bom));
  });

  return app;
};
