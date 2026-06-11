import { ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { updateSettingsSchema } from './tenant-settings.schema.ts';
import { createTenantSettingsService } from './tenant-settings.service.ts';

export const tenantSettingsRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createTenantSettingsService({ audit: deps.audit });

  // GET /api/tenant-settings — get-or-create (yo'q bo'lsa default row yaratiladi)
  app.get('/', requirePermission('tenant_settings.view'), async (c) =>
    c.json(ok(await service.getOrCreate(c))),
  );

  // PATCH /api/tenant-settings — partial update
  app.patch('/', requirePermission('tenant_settings.edit'), async (c) => {
    const body = updateSettingsSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    return c.json(ok(await service.update(c, body.data)));
  });

  return app;
};
