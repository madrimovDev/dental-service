import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { createTemplateSchema, signFormSchema, updateTemplateSchema } from './consent.schema.ts';
import { createConsentService } from './consent.service.ts';

export const consentRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createConsentService(deps);

  // ===== Templates =====
  app.get('/templates', requirePermission('consent.view'), async (c) => {
    const type = c.req.query('type');
    const activeOnly = c.req.query('active') !== 'false';
    return c.json(ok(await service.listTemplates(c, type, activeOnly)));
  });

  app.post('/templates', requirePermission('consent.manage'), async (c) => {
    const body = createTemplateSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.createTemplate(c, body.data);
    return c.json(ok(row), 201);
  });

  app.get('/templates/:id', requirePermission('consent.view'), async (c) => {
    const row = await service.getTemplate(c, c.req.param('id'));
    if (!row) return c.json(fail('template.not_found', 'Not found'), 404);
    return c.json(ok(row));
  });

  app.patch('/templates/:id', requirePermission('consent.manage'), async (c) => {
    const body = updateTemplateSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.updateTemplate(c, c.req.param('id'), body.data);
    if (!row) return c.json(fail('template.not_found', 'Not found'), 404);
    return c.json(ok(row));
  });

  // ===== Signed forms =====
  app.get('/forms', requirePermission('consent.view'), async (c) => {
    const patientId = c.req.query('patientId') ?? undefined;
    return c.json(ok(await service.listForms(c, patientId)));
  });

  app.post('/forms', requirePermission('consent.manage'), async (c) => {
    const body = signFormSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.signForm(c, body.data);
    return c.json(ok(row), 201);
  });

  return app;
};
