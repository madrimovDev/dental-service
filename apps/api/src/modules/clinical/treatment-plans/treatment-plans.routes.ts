import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../../lib/openapi.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import { toPlanDto, toPlanWithStagesDto, toStageDto } from './treatment-plans.mapper.ts';
import {
  createTreatmentPlanSchema,
  listPlansQuerySchema,
  planIdParamSchema,
  stageIdParamSchema,
  treatmentPlanDtoSchema,
  treatmentPlanWithStagesDtoSchema,
  treatmentStageDtoSchema,
  updateStageSchema,
  updateTreatmentPlanSchema,
} from './treatment-plans.schema.ts';
import { createTreatmentPlansService } from './treatment-plans.service.ts';

/** Standart 404 — plan not found */
const planNotFound = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Treatment plan not found',
  },
};

/** Standart 404 — stage not found */
const stageNotFound = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Treatment stage not found',
  },
};

export const treatmentPlansRoutes = (deps: { audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  const service = createTreatmentPlansService(deps);

  // ─── GET /treatment-plans — list ───────────────────────────────────────────

  const listRoute = createRoute({
    method: 'get',
    path: '/treatment-plans',
    tags: ['treatment-plans'],
    operationId: 'listTreatmentPlans',
    middleware: [requirePermission('medical_record.view')] as const,
    request: {
      query: listPlansQuerySchema,
    },
    responses: okJson(z.array(treatmentPlanDtoSchema), 'List of treatment plans'),
  });

  app.openapi(listRoute, async (c) => {
    const { patientId } = c.req.valid('query');
    const rows = await service.listPlans(c, patientId);
    return c.json(ok(rows.map(toPlanDto)), 200);
  });

  // ─── POST /treatment-plans — create ───────────────────────────────────────

  const createRoute_ = createRoute({
    method: 'post',
    path: '/treatment-plans',
    tags: ['treatment-plans'],
    operationId: 'createTreatmentPlan',
    middleware: [requirePermission('medical_record.edit')] as const,
    request: {
      body: { content: { 'application/json': { schema: createTreatmentPlanSchema } } },
    },
    responses: {
      201: {
        content: {
          'application/json': { schema: apiResponseSchema(treatmentPlanWithStagesDtoSchema) },
        },
        description: 'Treatment plan created',
      },
      400: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Validation error',
      },
      401: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Unauthorized',
      },
      403: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Forbidden',
      },
    },
  });

  app.openapi(createRoute_, async (c) => {
    const body = c.req.valid('json');
    const plan = await service.createPlan(c, body);
    return c.json(ok(toPlanWithStagesDto(plan)), 201);
  });

  // ─── GET /treatment-plans/{id} — get by id ─────────────────────────────────

  const getRoute = createRoute({
    method: 'get',
    path: '/treatment-plans/{id}',
    tags: ['treatment-plans'],
    operationId: 'getTreatmentPlan',
    middleware: [requirePermission('medical_record.view')] as const,
    request: {
      params: planIdParamSchema,
    },
    responses: {
      ...okJson(treatmentPlanWithStagesDtoSchema, 'Treatment plan with stages'),
      ...planNotFound,
    },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const plan = await service.getPlan(c, id);
    if (!plan) return c.json(fail('plan.not_found', 'Plan not found'), 404);
    return c.json(ok(toPlanWithStagesDto(plan)), 200);
  });

  // ─── PATCH /treatment-plans/{id} — update ─────────────────────────────────

  const updatePlanRoute = createRoute({
    method: 'patch',
    path: '/treatment-plans/{id}',
    tags: ['treatment-plans'],
    operationId: 'updateTreatmentPlan',
    middleware: [requirePermission('medical_record.edit')] as const,
    request: {
      params: planIdParamSchema,
      body: { content: { 'application/json': { schema: updateTreatmentPlanSchema } } },
    },
    responses: {
      ...okJson(treatmentPlanDtoSchema, 'Updated treatment plan'),
      ...planNotFound,
    },
  });

  app.openapi(updatePlanRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const plan = await service.updatePlan(c, id, body);
    if (!plan) return c.json(fail('plan.not_found', 'Plan not found'), 404);
    return c.json(ok(toPlanDto(plan)), 200);
  });

  // ─── PATCH /treatment-stages/{id} — update stage ──────────────────────────

  const updateStageRoute = createRoute({
    method: 'patch',
    path: '/treatment-stages/{id}',
    tags: ['treatment-plans'],
    operationId: 'updateTreatmentStage',
    middleware: [requirePermission('medical_record.edit')] as const,
    request: {
      params: stageIdParamSchema,
      body: { content: { 'application/json': { schema: updateStageSchema } } },
    },
    responses: {
      ...okJson(treatmentStageDtoSchema, 'Updated treatment stage'),
      ...stageNotFound,
    },
  });

  app.openapi(updateStageRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const stage = await service.updateStage(c, id, body);
    if (!stage) return c.json(fail('stage.not_found', 'Stage not found'), 404);
    return c.json(ok(toStageDto(stage)), 200);
  });

  return app;
};
