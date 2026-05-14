import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { createPrescriptionSchema, updatePrescriptionSchema } from './prescriptions.schema.ts';
import { createPrescriptionsService } from './prescriptions.service.ts';

export const prescriptionsRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createPrescriptionsService(deps);

  app.get('/', requirePermission('prescription.view'), async (c) => {
    const patientId = c.req.query('patientId') ?? undefined;
    return c.json(ok(await service.list(c, patientId)));
  });

  app.post('/', requirePermission('prescription.manage'), async (c) => {
    const body = createPrescriptionSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.create(c, body.data);
    return c.json(ok(row), 201);
  });

  app.get('/:id', requirePermission('prescription.view'), async (c) => {
    const row = await service.get(c, c.req.param('id'));
    if (!row) return c.json(fail('prescription.not_found', 'Not found'), 404);
    return c.json(ok(row));
  });

  app.patch('/:id', requirePermission('prescription.manage'), async (c) => {
    const body = updatePrescriptionSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.update(c, c.req.param('id'), body.data);
    if (!row) return c.json(fail('prescription.not_found', 'Not found'), 404);
    return c.json(ok(row));
  });

  app.delete('/:id', requirePermission('prescription.manage'), async (c) => {
    const row = await service.remove(c, c.req.param('id'));
    if (!row) return c.json(fail('prescription.not_found', 'Not found'), 404);
    return c.json(ok({ deleted: true }));
  });

  return app;
};
