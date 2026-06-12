import { ok } from '@dental/core';
import { permissions as permissionsTable } from '@dental/db-schema';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import { okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { permissionDefDtoSchema } from './permissions.schema.ts';

/**
 * Permissions katalogini ko'rsatish — read-only.
 * Role builder UI shu yerdan kategoriya bo'yicha guruhlangan permissionlarni oladi.
 */
export const permissionRoutes = (deps: { db: Database }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['permissions'],
    operationId: 'listPermissions',
    middleware: [requirePermission('permission.view')] as const,
    responses: okJson(z.array(permissionDefDtoSchema), 'Platform permission catalog'),
  });

  app.openapi(listRoute, async (c) => {
    const result = await deps.db.select().from(permissionsTable).orderBy(permissionsTable.category);
    return c.json(ok(result), 200);
  });

  return app;
};
