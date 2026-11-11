import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  backupRequestedSchema,
  backupSettingsInputSchema,
  backupSettingsSchema,
  backupStatusSchema,
  restoreBackupInputSchema,
} from './backup.schema.ts';
import {
  type BackupFailure,
  type BackupServiceDeps,
  createBackupService,
} from './backup.service.ts';

const FAILURE_STATUS: Record<BackupFailure, 400 | 403 | 404 | 409> = {
  'backup.not_available': 404,
  'backup.owner_only': 403,
  'backup.confirm_mismatch': 400,
  'backup.file_invalid': 400,
  'backup.folder_invalid': 400,
  'backup.restore_pending': 409,
};

const errorResponses = {
  400: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Validation error',
  },
  403: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Forbidden',
  },
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Not available outside Local Desktop',
  },
  409: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'A restore is already pending',
  },
};

/**
 * `/api/backup` — desktop zaxira nusxa (UI-3 / D.1). Haqiqiy ish Electron main'da
 * (`apps/desktop/src/backup-scheduler.ts`): API faqat holatni o'qiydi va so'rov
 * fayllarini (`<dataDir>/backup-request.json`, `restore-request.json`) yozadi.
 * Cloud (SaaS) rejimida status `mode:'cloud'`, qolganlari 404.
 */
export const backupRoutes = (deps: { db: Database; audit: AuditLogger } & BackupServiceDeps) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createBackupService(deps);

  const statusRoute = createRoute({
    method: 'get',
    path: '/status',
    tags: ['backup'],
    operationId: 'getBackupStatus',
    middleware: [requirePermission('tenant_settings.view')] as const,
    responses: okJson(backupStatusSchema, 'Backup status (desktop) or cloud marker'),
  });
  app.openapi(statusRoute, async (c) => c.json(ok(service.status()), 200));

  const runRoute = createRoute({
    method: 'post',
    path: '/run',
    tags: ['backup'],
    operationId: 'runBackup',
    middleware: [requirePermission('tenant_settings.edit')] as const,
    responses: {
      202: {
        content: { 'application/json': { schema: apiResponseSchema(backupRequestedSchema) } },
        description: 'Backup requested (Electron main picks it up)',
      },
      ...errorResponses,
    },
  });
  app.openapi(runRoute, async (c) => {
    const r = await service.run(c);
    if (!r.ok) return c.json(fail(r.code, r.code), FAILURE_STATUS[r.code]);
    return c.json(ok(r.value), 202);
  });

  const settingsRoute = createRoute({
    method: 'put',
    path: '/settings',
    tags: ['backup'],
    operationId: 'updateBackupSettings',
    request: { body: { content: { 'application/json': { schema: backupSettingsInputSchema } } } },
    responses: {
      200: {
        content: { 'application/json': { schema: apiResponseSchema(backupSettingsSchema) } },
        description: 'Backup folder saved (owner only)',
      },
      ...errorResponses,
    },
  });
  app.openapi(settingsRoute, async (c) => {
    const r = await service.setFolder(c, c.req.valid('json').folder);
    if (!r.ok) return c.json(fail(r.code, r.code), FAILURE_STATUS[r.code]);
    return c.json(ok(r.value), 200);
  });

  const restoreRoute = createRoute({
    method: 'post',
    path: '/restore',
    tags: ['backup'],
    operationId: 'restoreBackup',
    request: { body: { content: { 'application/json': { schema: restoreBackupInputSchema } } } },
    responses: {
      202: {
        content: { 'application/json': { schema: apiResponseSchema(backupRequestedSchema) } },
        description: 'Restore requested (owner only; Electron main performs it)',
      },
      ...errorResponses,
    },
  });
  app.openapi(restoreRoute, async (c) => {
    const r = await service.requestRestore(c, c.req.valid('json'));
    if (!r.ok) return c.json(fail(r.code, r.code), FAILURE_STATUS[r.code]);
    return c.json(ok(r.value), 202);
  });

  return app;
};
