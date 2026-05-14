import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { createLabOrderSchema, updateLabOrderSchema } from './lab-orders.schema.ts';
import { createLabOrdersService } from './lab-orders.service.ts';

export const labOrdersRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createLabOrdersService(deps);

  app.get('/', requirePermission('lab_order.view'), async (c) => {
    const patientId = c.req.query('patientId') ?? undefined;
    const status = c.req.query('status') ?? undefined;
    return c.json(ok(await service.list(c, patientId, status)));
  });

  app.post('/', requirePermission('lab_order.manage'), async (c) => {
    const body = createLabOrderSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.create(c, body.data);
    return c.json(ok(row), 201);
  });

  app.get('/:id', requirePermission('lab_order.view'), async (c) => {
    const row = await service.get(c, c.req.param('id'));
    if (!row) return c.json(fail('lab_order.not_found', 'Not found'), 404);
    return c.json(ok(row));
  });

  app.patch('/:id', requirePermission('lab_order.manage'), async (c) => {
    const body = updateLabOrderSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.update(c, c.req.param('id'), body.data);
    if (!row) return c.json(fail('lab_order.not_found', 'Not found'), 404);
    return c.json(ok(row));
  });

  return app;
};
