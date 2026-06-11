import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { createQueueTicketSchema, updateQueueStatusSchema } from './queue.schema.ts';
import { createQueueService } from './queue.service.ts';

export const queueRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createQueueService({ audit: deps.audit });

  app.get('/', requirePermission('queue.view'), async (c) => {
    const branchId = c.req.query('branchId');
    if (!branchId) return c.json(fail('query.missing', 'branchId required'), 400);
    return c.json(ok(await service.todayList(c, branchId)));
  });

  app.get('/check-in-candidates', requirePermission('queue.create'), async (c) => {
    const branchId = c.req.query('branchId');
    if (!branchId) return c.json(fail('query.missing', 'branchId required'), 400);
    return c.json(ok(await service.checkInCandidates(c, branchId)));
  });

  app.post('/', requirePermission('queue.create'), async (c) => {
    const body = createQueueTicketSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const ticket = await service.create(c, body.data);
    return c.json(ok(ticket), 201);
  });

  app.patch('/:id/status', requirePermission('queue.manage'), async (c) => {
    const body = updateQueueStatusSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const ticket = await service.updateStatus(c, c.req.param('id'), body.data);
    if (!ticket) return c.json(fail('ticket.not_found', 'Queue ticket not found'), 404);
    return c.json(ok(ticket));
  });

  return app;
};
