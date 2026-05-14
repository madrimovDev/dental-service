import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { createBranchSchema, updateBranchSchema } from './branches.schema.ts';
import { createBranchesService } from './branches.service.ts';

export const branchRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createBranchesService({ audit: deps.audit });

  app.get('/', requirePermission('branch.view'), async (c) => {
    return c.json(ok(await service.list(c)));
  });

  app.post('/', requirePermission('branch.create'), async (c) => {
    const body = createBranchSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.create(c, body.data);
    return c.json(ok(row), 201);
  });

  app.get('/:id', requirePermission('branch.view'), async (c) => {
    const row = await service.findById(c, c.req.param('id'));
    if (!row) return c.json(fail('branch.not_found', 'Branch not found'), 404);
    return c.json(ok(row));
  });

  app.patch('/:id', requirePermission('branch.edit'), async (c) => {
    const body = updateBranchSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.update(c, c.req.param('id'), body.data);
    if (!row) return c.json(fail('branch.not_found', 'Branch not found'), 404);
    return c.json(ok(row));
  });

  app.delete('/:id', requirePermission('branch.delete'), async (c) => {
    const row = await service.remove(c, c.req.param('id'));
    if (!row) return c.json(fail('branch.not_found', 'Branch not found'), 404);
    return c.json(ok({ deleted: true, id: row.id }));
  });

  return app;
};
