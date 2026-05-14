import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  createServiceSchema,
  setServicePriceSchema,
  updateServiceSchema,
} from './services.schema.ts';
import { createServicesService } from './services.service.ts';

export const serviceRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createServicesService({ audit: deps.audit });

  app.get('/', requirePermission('service.view'), async (c) => {
    return c.json(ok(await service.list(c)));
  });

  app.post('/', requirePermission('service.manage'), async (c) => {
    const body = createServiceSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.create(c, body.data);
    return c.json(ok(row), 201);
  });

  app.get('/:id', requirePermission('service.view'), async (c) => {
    const row = await service.findById(c, c.req.param('id'));
    if (!row) return c.json(fail('service.not_found', 'Service not found'), 404);
    return c.json(ok(row));
  });

  app.patch('/:id', requirePermission('service.manage'), async (c) => {
    const body = updateServiceSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.update(c, c.req.param('id'), body.data);
    if (!row) return c.json(fail('service.not_found', 'Service not found'), 404);
    return c.json(ok(row));
  });

  app.delete('/:id', requirePermission('service.manage'), async (c) => {
    const row = await service.remove(c, c.req.param('id'));
    if (!row) return c.json(fail('service.not_found', 'Service not found'), 404);
    return c.json(ok({ deleted: true }));
  });

  app.post('/:id/prices', requirePermission('service.manage'), async (c) => {
    const body = setServicePriceSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.setPrice(c, c.req.param('id'), body.data);
    return c.json(ok(row), 201);
  });

  return app;
};
