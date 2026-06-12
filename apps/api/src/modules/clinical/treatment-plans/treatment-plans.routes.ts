import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import {
  createTreatmentPlanSchema,
  updateStageSchema,
  updateTreatmentPlanSchema,
} from './treatment-plans.schema.ts';
import { createTreatmentPlansService } from './treatment-plans.service.ts';

export const treatmentPlansRoutes = (deps: { audit: AuditLogger }) => {
  const app = new Hono();
  const service = createTreatmentPlansService(deps);

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

  return app;
};
