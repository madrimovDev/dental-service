import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  createAppointmentSchema,
  listAppointmentsQuery,
  updateAppointmentSchema,
} from './appointments.schema.ts';
import { createAppointmentsService } from './appointments.service.ts';

export const appointmentRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createAppointmentsService({ audit: deps.audit });

  app.get('/', requirePermission('appointment.view'), async (c) => {
    const query = listAppointmentsQuery.safeParse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    if (!query.success) throw new HTTPException(400, { message: 'Invalid query' });
    return c.json(ok(await service.list(c, query.data)));
  });

  app.post('/', requirePermission('appointment.create'), async (c) => {
    const body = createAppointmentSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const result = await service.create(c, body.data);
    if (!result.ok) {
      const status = result.code === 'conflict.doctor_busy' ? 409 : 400;
      return c.json(fail(result.code, result.code), status);
    }
    return c.json(ok(result.appointment), 201);
  });

  app.get('/:id', requirePermission('appointment.view'), async (c) => {
    const row = await service.getById(c, c.req.param('id'));
    if (!row) return c.json(fail('appointment.not_found', 'Appointment not found'), 404);
    return c.json(ok(row));
  });

  app.patch('/:id', requirePermission('appointment.edit'), async (c) => {
    const body = updateAppointmentSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const result = await service.update(c, c.req.param('id'), body.data);
    if (!result.ok) {
      const status =
        result.code === 'conflict.doctor_busy' ? 409 : result.code === 'not_found' ? 404 : 400;
      return c.json(fail(result.code, result.code), status);
    }
    return c.json(ok(result.appointment));
  });

  app.post('/:id/cancel', requirePermission('appointment.cancel'), async (c) => {
    const reason = (await c.req.json().catch(() => ({ reason: undefined }))) as {
      reason?: string;
    };
    const result = await service.cancel(c, c.req.param('id'), reason.reason);
    if (!result.ok) return c.json(fail(result.code, result.code), 400);
    return c.json(ok(result.appointment));
  });

  return app;
};
