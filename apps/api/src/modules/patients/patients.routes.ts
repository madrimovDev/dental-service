import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  addRelativeSchema,
  createPatientSchema,
  listQuerySchema,
  updateMedicalRecordSchema,
  updatePatientSchema,
} from './patients.schema.ts';
import { createPatientsService } from './patients.service.ts';

export const patientRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createPatientsService({ audit: deps.audit });

  // GET /api/patients?search&archived&page&pageSize
  app.get('/', requirePermission('patient.view'), async (c) => {
    const query = listQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!query.success) throw new HTTPException(400, { message: 'Invalid query' });
    return c.json(ok(await service.list(c, query.data)));
  });

  app.post('/', requirePermission('patient.create'), async (c) => {
    const body = createPatientSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.create(c, body.data);
    return c.json(ok(row), 201);
  });

  app.get('/:id', requirePermission('patient.view'), async (c) => {
    const row = await service.findById(c, c.req.param('id'));
    if (!row) return c.json(fail('patient.not_found', 'Patient not found'), 404);
    return c.json(ok(row));
  });

  app.get('/:id/balance', requirePermission('patient.view'), async (c) => {
    return c.json(ok(await service.balanceFor(c, c.req.param('id'))));
  });

  app.patch('/:id', requirePermission('patient.edit'), async (c) => {
    const body = updatePatientSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.update(c, c.req.param('id'), body.data);
    if (!row) return c.json(fail('patient.not_found', 'Patient not found'), 404);
    return c.json(ok(row));
  });

  app.delete('/:id', requirePermission('patient.delete'), async (c) => {
    const row = await service.archive(c, c.req.param('id'));
    if (!row) return c.json(fail('patient.not_found', 'Patient not found'), 404);
    return c.json(ok({ archived: true, id: row.id }));
  });

  // ===== Medical record sub-resource =====

  app.get('/:id/medical', requirePermission('medical_record.view'), async (c) => {
    const row = await service.getMedicalRecord(c, c.req.param('id'));
    if (!row) return c.json(fail('medical_record.not_found', 'Medical record not found'), 404);
    return c.json(ok(row));
  });

  app.patch('/:id/medical', requirePermission('medical_record.edit'), async (c) => {
    const body = updateMedicalRecordSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.updateMedicalRecord(c, c.req.param('id'), body.data);
    if (!row) return c.json(fail('medical_record.not_found', 'Medical record not found'), 404);
    return c.json(ok(row));
  });

  // ===== Patient relatives (oila) sub-resource =====

  app.get('/:id/relatives', requirePermission('patient.edit'), async (c) => {
    return c.json(ok(await service.listRelatives(c, c.req.param('id'))));
  });

  app.post('/:id/relatives', requirePermission('patient.edit'), async (c) => {
    const body = addRelativeSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.addRelative(c, c.req.param('id'), body.data);
    return c.json(ok(row), 201);
  });

  app.delete('/:id/relatives/:relId', requirePermission('patient.edit'), async (c) => {
    const row = await service.removeRelative(c, c.req.param('id'), c.req.param('relId'));
    if (!row) return c.json(fail('patient_relative.not_found', 'Relative link not found'), 404);
    return c.json(ok({ removed: true, id: row.id }));
  });

  return app;
};
