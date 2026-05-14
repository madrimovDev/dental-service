import { ok } from '@dental/core';
import { permissions as permissionsTable } from '@dental/db-schema';
import { Hono } from 'hono';
import type { Database } from '../../db/client.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';

/**
 * Permissions katalogini ko'rsatish — read-only.
 * Role builder UI shu yerdan kategoriya bo'yicha guruhlangan permissionlarni oladi.
 */
export const permissionRoutes = (deps: { db: Database }) => {
  const app = new Hono();
  app.use('*', authMiddleware());

  app.get('/', requirePermission('permission.view'), async (c) => {
    const result = await deps.db.select().from(permissionsTable).orderBy(permissionsTable.category);
    return c.json(ok(result));
  });

  return app;
};
