import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { createRoleSchema, setRolePermissionsSchema, updateRoleSchema } from './roles.schema.ts';
import { createRolesService } from './roles.service.ts';

export const roleRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createRolesService({ audit: deps.audit });

  app.get('/', requirePermission('role.view'), async (c) => {
    return c.json(ok(await service.list(c)));
  });

  app.post('/', requirePermission('role.manage'), async (c) => {
    const body = createRoleSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.create(c, body.data);
    return c.json(ok(row), 201);
  });

  app.get('/:id', requirePermission('role.view'), async (c) => {
    const row = await service.findById(c, c.req.param('id'));
    if (!row) return c.json(fail('role.not_found', 'Role not found'), 404);
    return c.json(ok(row));
  });

  app.patch('/:id', requirePermission('role.manage'), async (c) => {
    const body = updateRoleSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.update(c, c.req.param('id'), body.data);
    if (!row) return c.json(fail('role.not_found', 'Role not found'), 404);
    return c.json(ok(row));
  });

  app.put('/:id/permissions', requirePermission('role.manage'), async (c) => {
    const body = setRolePermissionsSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.setPermissions(c, c.req.param('id'), body.data.permissions);
    if (!row) return c.json(fail('role.not_found', 'Role not found'), 404);
    return c.json(ok(row));
  });

  app.delete('/:id', requirePermission('role.manage'), async (c) => {
    const result = await service.remove(c, c.req.param('id'));
    if (!result.ok) {
      const status = result.code === 'role.system_protected' ? 403 : 404;
      return c.json(fail(result.code, result.code), status);
    }
    return c.json(ok({ deleted: true }));
  });

  return app;
};
