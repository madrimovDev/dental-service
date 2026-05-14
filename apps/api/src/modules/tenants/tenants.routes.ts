import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { transferOwnershipSchema, updateTenantSchema } from './tenants.schema.ts';
import { createTenantsService } from './tenants.service.ts';

export const tenantRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createTenantsService(deps);

  app.get('/', requirePermission('tenant.view'), async (c) => {
    const tenant = await service.getCurrent(c);
    if (!tenant) return c.json(fail('tenant.not_found', 'Tenant not found'), 404);
    return c.json(ok(tenant));
  });

  app.patch('/', requirePermission('tenant.edit'), async (c) => {
    const body = updateTenantSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const updated = await service.update(c, body.data);
    if (!updated) return c.json(fail('tenant.not_found', 'Tenant not found'), 404);
    return c.json(ok(updated));
  });

  // Owner-only — bu yerda middleware'da emas, route handler ichida explicit check
  app.post('/transfer-ownership', async (c) => {
    const body = transferOwnershipSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const result = await service.transferOwnership(c, body.data);
    if (!result.ok) {
      const status = result.code === 'tenant.owner_only' ? 403 : 400;
      return c.json(fail(result.code, result.code), status);
    }
    return c.json(ok(result.tenant));
  });

  return app;
};
