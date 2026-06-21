import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  availabilityDtoSchema,
  availabilityQuerySchema,
  createTimeOffSchema,
  doctorIdParamSchema,
  listTimeOffQuerySchema,
  putWorkingHoursSchema,
  timeOffDtoSchema,
  timeOffIdParamSchema,
  workingHoursQuerySchema,
  workingHoursSegmentDtoSchema,
} from './schedule.schema.ts';
import { createScheduleService } from './schedule.service.ts';

const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Not found',
  },
};

const badRequestResponse = {
  400: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Validation error',
  },
};

export const scheduleRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createScheduleService({ audit: deps.audit });

  // ─── GET /doctors/{id}/working-hours ───────────────────────────────────────

  const getWorkingHoursRoute = createRoute({
    method: 'get',
    path: '/doctors/{id}/working-hours',
    tags: ['schedule'],
    operationId: 'getDoctorWorkingHours',
    middleware: [requirePermission('schedule.view')] as const,
    request: { params: doctorIdParamSchema, query: workingHoursQuerySchema },
    responses: okJson(z.array(workingHoursSegmentDtoSchema), 'Doctor working hours'),
  });

  app.openapi(getWorkingHoursRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { branchId } = c.req.valid('query');
    const rows = await service.getWorkingHours(c, id, branchId);
    return c.json(ok(rows), 200);
  });

  // ─── PUT /doctors/{id}/working-hours (bulk replace) ────────────────────────

  const putWorkingHoursRoute = createRoute({
    method: 'put',
    path: '/doctors/{id}/working-hours',
    tags: ['schedule'],
    operationId: 'putDoctorWorkingHours',
    middleware: [requirePermission('schedule.manage')] as const,
    request: {
      params: doctorIdParamSchema,
      body: { content: { 'application/json': { schema: putWorkingHoursSchema } } },
    },
    responses: {
      ...okJson(z.array(workingHoursSegmentDtoSchema), 'Replaced working hours'),
      ...badRequestResponse,
    },
  });

  app.openapi(putWorkingHoursRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await service.replaceWorkingHours(c, id, body);
    if (!result.ok) return c.json(fail(result.code, result.code), 400);
    return c.json(ok(result.segments), 200);
  });

  // ─── GET /time-off ─────────────────────────────────────────────────────────

  const listTimeOffRoute = createRoute({
    method: 'get',
    path: '/time-off',
    tags: ['schedule'],
    operationId: 'listTimeOff',
    middleware: [requirePermission('schedule.view')] as const,
    request: { query: listTimeOffQuerySchema },
    responses: okJson(z.array(timeOffDtoSchema), 'Time-off entries'),
  });

  app.openapi(listTimeOffRoute, async (c) => {
    const query = c.req.valid('query');
    const rows = await service.listTimeOff(c, query);
    return c.json(ok(rows), 200);
  });

  // ─── POST /time-off ────────────────────────────────────────────────────────

  const createTimeOffRoute = createRoute({
    method: 'post',
    path: '/time-off',
    tags: ['schedule'],
    operationId: 'createTimeOff',
    middleware: [requirePermission('schedule.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createTimeOffSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(timeOffDtoSchema) } },
        description: 'Time-off created',
      },
      ...badRequestResponse,
    },
  });

  app.openapi(createTimeOffRoute, async (c) => {
    const body = c.req.valid('json');
    const result = await service.createTimeOff(c, body);
    if (!result.ok) return c.json(fail(result.code, result.code), 400);
    return c.json(ok(result.timeOff), 201);
  });

  // ─── DELETE /time-off/{id} ─────────────────────────────────────────────────

  const deleteTimeOffRoute = createRoute({
    method: 'delete',
    path: '/time-off/{id}',
    tags: ['schedule'],
    operationId: 'deleteTimeOff',
    middleware: [requirePermission('schedule.manage')] as const,
    request: { params: timeOffIdParamSchema },
    responses: {
      ...okJson(z.object({ id: z.uuid() }), 'Deleted'),
      ...notFoundResponse,
    },
  });

  app.openapi(deleteTimeOffRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.deleteTimeOff(c, id);
    if (!result.ok) return c.json(fail(result.code, result.code), 404);
    return c.json(ok({ id }), 200);
  });

  // ─── GET /availability ─────────────────────────────────────────────────────

  const availabilityRoute = createRoute({
    method: 'get',
    path: '/availability',
    tags: ['schedule'],
    operationId: 'getAvailability',
    middleware: [requirePermission('schedule.view')] as const,
    request: { query: availabilityQuerySchema },
    responses: okJson(availabilityDtoSchema, 'Available slots'),
  });

  app.openapi(availabilityRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await service.getAvailability(c, query);
    return c.json(ok(result), 200);
  });

  return app;
};
