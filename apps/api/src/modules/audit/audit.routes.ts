import { ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { auditListQuerySchema } from './audit.schema.ts';
import { createAuditService } from './audit.service.ts';

export const auditRoutes = (deps: { db: Database }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createAuditService();

  app.get('/', requirePermission('audit_log.view'), async (c) => {
    const q = auditListQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!q.success) throw new HTTPException(400, { message: 'Invalid query' });
    return c.json(ok(await service.list(c, q.data)));
  });

  return app;
};
