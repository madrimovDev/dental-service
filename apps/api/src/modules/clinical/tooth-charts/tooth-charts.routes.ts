import { ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { AuditLogger } from '../../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../../lib/openapi.ts';
import { requireFeature } from '../../../middleware/require-feature.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import { toToothChartDto, toToothChartWithStatesDto } from './tooth-charts.mapper.ts';
import {
  createToothChartSchema,
  patientIdParamSchema,
  toothChartDtoSchema,
  toothChartWithStatesDtoSchema,
} from './tooth-charts.schema.ts';
import { createToothChartsService } from './tooth-charts.service.ts';

export const toothChartsRoutes = (deps: { audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  const service = createToothChartsService(deps);

  // ─── GET /patients/{patientId}/tooth-charts — list ──────────────────────────

  const listRoute = createRoute({
    method: 'get',
    path: '/patients/{patientId}/tooth-charts',
    tags: ['tooth-charts'],
    operationId: 'listToothCharts',
    middleware: [requirePermission('medical_record.view'), requireFeature('odontogram')] as const,
    request: {
      params: patientIdParamSchema,
    },
    responses: okJson(z.array(toothChartDtoSchema), 'List of tooth chart snapshots'),
  });

  app.openapi(listRoute, async (c) => {
    const { patientId } = c.req.valid('param');
    const rows = await service.list(c, patientId);
    return c.json(ok(rows.map(toToothChartDto)), 200);
  });

  // ─── GET /patients/{patientId}/tooth-charts/latest — latest with states ─────

  const latestRoute = createRoute({
    method: 'get',
    path: '/patients/{patientId}/tooth-charts/latest',
    tags: ['tooth-charts'],
    operationId: 'getLatestToothChart',
    middleware: [requirePermission('medical_record.view'), requireFeature('odontogram')] as const,
    request: {
      params: patientIdParamSchema,
    },
    responses: okJson(
      toothChartWithStatesDtoSchema.nullable(),
      'Latest tooth chart with states, or null if none',
    ),
  });

  app.openapi(latestRoute, async (c) => {
    const { patientId } = c.req.valid('param');
    const chart = await service.getLatest(c, patientId);
    if (!chart) return c.json(ok(null), 200);
    return c.json(ok(toToothChartWithStatesDto(chart)), 200);
  });

  // ─── POST /tooth-charts — create ─────────────────────────────────────────────

  const createRoute_ = createRoute({
    method: 'post',
    path: '/tooth-charts',
    tags: ['tooth-charts'],
    operationId: 'createToothChart',
    middleware: [requirePermission('medical_record.edit'), requireFeature('odontogram')] as const,
    request: {
      body: { content: { 'application/json': { schema: createToothChartSchema } } },
    },
    responses: {
      201: {
        content: {
          'application/json': { schema: apiResponseSchema(toothChartWithStatesDtoSchema) },
        },
        description: 'Tooth chart snapshot created',
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
    const chart = await service.create(c, body);
    return c.json(ok(toToothChartWithStatesDto(chart)), 201);
  });

  return app;
};
