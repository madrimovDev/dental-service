import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  createToothChartSchema,
  createTreatmentPlanSchema,
  createVisitNoteSchema,
  updateStageSchema,
  updateTreatmentPlanSchema,
  updateVisitNoteSchema,
} from './clinical.schema.ts';
import { createClinicalService } from './clinical.service.ts';

/**
 * Clinical routes — barchasi bitta module ichida:
 *   /api/diagnoses (read-only)
 *   /api/treatment-plans (CRUD + stages)
 *   /api/visit-notes (CRUD)
 *   /api/tooth-charts (snapshot create + read)
 */
export const clinicalRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createClinicalService(deps);

  // ===== Diagnoses (ICD-10 katalog) — read-only, faqat permission tekshiriladi =====
  app.get('/diagnoses', requirePermission('medical_record.view'), async (c) => {
    const search = c.req.query('search') ?? undefined;
    return c.json(ok(await service.listDiagnoses(search)));
  });

  // ===== Treatment Plans =====
  app.get('/treatment-plans', requirePermission('medical_record.view'), async (c) => {
    const patientId = c.req.query('patientId') ?? undefined;
    return c.json(ok(await service.listPlans(c, patientId)));
  });

  app.post('/treatment-plans', requirePermission('medical_record.edit'), async (c) => {
    const body = createTreatmentPlanSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const plan = await service.createPlan(c, body.data);
    return c.json(ok(plan), 201);
  });

  app.get('/treatment-plans/:id', requirePermission('medical_record.view'), async (c) => {
    const plan = await service.getPlan(c, c.req.param('id'));
    if (!plan) return c.json(fail('plan.not_found', 'Plan not found'), 404);
    return c.json(ok(plan));
  });

  app.patch('/treatment-plans/:id', requirePermission('medical_record.edit'), async (c) => {
    const body = updateTreatmentPlanSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const plan = await service.updatePlan(c, c.req.param('id'), body.data);
    if (!plan) return c.json(fail('plan.not_found', 'Plan not found'), 404);
    return c.json(ok(plan));
  });

  app.patch('/treatment-stages/:id', requirePermission('medical_record.edit'), async (c) => {
    const body = updateStageSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const stage = await service.updateStage(c, c.req.param('id'), body.data);
    if (!stage) return c.json(fail('stage.not_found', 'Stage not found'), 404);
    return c.json(ok(stage));
  });

  // ===== Visit Notes =====
  app.get('/visit-notes', requirePermission('medical_record.view'), async (c) => {
    const patientId = c.req.query('patientId') ?? undefined;
    return c.json(ok(await service.listVisitNotes(c, patientId)));
  });

  app.post('/visit-notes', requirePermission('medical_record.edit'), async (c) => {
    const body = createVisitNoteSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const note = await service.createVisitNote(c, body.data);
    return c.json(ok(note), 201);
  });

  app.get('/visit-notes/:id', requirePermission('medical_record.view'), async (c) => {
    const note = await service.getVisitNote(c, c.req.param('id'));
    if (!note) return c.json(fail('note.not_found', 'Note not found'), 404);
    return c.json(ok(note));
  });

  app.patch('/visit-notes/:id', requirePermission('medical_record.edit'), async (c) => {
    const body = updateVisitNoteSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const note = await service.updateVisitNote(c, c.req.param('id'), body.data);
    if (!note) return c.json(fail('note.not_found', 'Note not found'), 404);
    return c.json(ok(note));
  });

  // ===== Tooth Charts (Odontogram) =====
  app.get(
    '/patients/:patientId/tooth-charts',
    requirePermission('medical_record.view'),
    async (c) => {
      return c.json(ok(await service.listToothCharts(c, c.req.param('patientId'))));
    },
  );

  app.get(
    '/patients/:patientId/tooth-charts/latest',
    requirePermission('medical_record.view'),
    async (c) => {
      const chart = await service.getLatestToothChart(c, c.req.param('patientId'));
      if (!chart) return c.json(ok(null));
      return c.json(ok(chart));
    },
  );

  app.post('/tooth-charts', requirePermission('medical_record.edit'), async (c) => {
    const body = createToothChartSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const chart = await service.createToothChart(c, body.data);
    return c.json(ok(chart), 201);
  });

  return app;
};
