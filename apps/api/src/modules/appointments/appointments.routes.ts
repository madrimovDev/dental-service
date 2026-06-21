import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { reminderJobId, reminderQueue } from '../../lib/queue.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toAppointmentDto } from './appointments.mapper.ts';
import {
  appointmentDtoSchema,
  appointmentIdParamSchema,
  cancelAppointmentBodySchema,
  createAppointmentSchema,
  doctorListItemDtoSchema,
  listAppointmentsQuery,
  updateAppointmentSchema,
} from './appointments.schema.ts';
import { createAppointmentsService, type SchedulePredicates } from './appointments.service.ts';

/** Standart 404 response — get / patch / cancel endpoint'lar uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Appointment not found',
  },
};

/**
 * 409 Conflict response — create / patch endpoint'lar uchun. Kodlar:
 * `conflict.doctor_busy`, `schedule.outside_working_hours` (A6),
 * `schedule.doctor_on_time_off` (A6).
 */
const conflictResponse = {
  409: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Scheduling conflict (doctor busy / outside working hours / on time-off)',
  },
};

export const appointmentRoutes = (deps: {
  db: Database;
  audit: AuditLogger;
  schedule?: SchedulePredicates;
}) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createAppointmentsService({
    audit: deps.audit,
    schedule: deps.schedule,
    enqueueReminder: async (tenantId, appointmentId, delayMs) => {
      await reminderQueue.add(
        'appointment-reminder',
        { tenantId, appointmentId },
        { delay: delayMs, jobId: reminderJobId(appointmentId) },
      );
    },
    removeReminder: async (appointmentId) => {
      await reminderQueue.remove(reminderJobId(appointmentId));
    },
  });

  // ─── GET / — list ─────────────────────────────────────────────────────────

  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['appointments'],
    operationId: 'listAppointments',
    middleware: [requirePermission('appointment.view')] as const,
    request: {
      query: listAppointmentsQuery,
    },
    responses: okJson(z.array(appointmentDtoSchema), 'List of appointments'),
  });

  app.openapi(listRoute, async (c) => {
    const query = c.req.valid('query');
    const rows = await service.list(c, query);
    return c.json(ok(rows.map(toAppointmentDto)), 200);
  });

  // ─── POST / — create ──────────────────────────────────────────────────────

  const createAppointmentRoute = createRoute({
    method: 'post',
    path: '/',
    tags: ['appointments'],
    operationId: 'createAppointment',
    middleware: [requirePermission('appointment.create')] as const,
    request: {
      body: { content: { 'application/json': { schema: createAppointmentSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(appointmentDtoSchema) } },
        description: 'Appointment created',
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
      ...conflictResponse,
    },
  });

  app.openapi(createAppointmentRoute, async (c) => {
    const body = c.req.valid('json');
    const result = await service.create(c, body);
    if (!result.ok) {
      // Konflikt oilasi (409): doctor_busy + ish-soati/time-off guard'lari (A6).
      if (
        result.code === 'conflict.doctor_busy' ||
        result.code === 'schedule.outside_working_hours' ||
        result.code === 'schedule.doctor_on_time_off'
      )
        return c.json(fail(result.code, result.code), 409);
      return c.json(fail(result.code, result.code), 400);
    }
    if (!result.appointment)
      return c.json(fail('insert.failed', 'Appointment creation failed'), 400);
    return c.json(ok(toAppointmentDto(result.appointment)), 201);
  });

  // ─── GET /doctors — yozilish uchun doktorlar ro'yxati (CLI-154) ────────────
  // Static path — `/{id}` dan OLDIN ro'yxatdan o'tadi (param bilan to'qnashmasin).

  const listDoctorsRoute = createRoute({
    method: 'get',
    path: '/doctors',
    tags: ['appointments'],
    operationId: 'listDoctors',
    middleware: [requirePermission('appointment.view')] as const,
    responses: okJson(z.array(doctorListItemDtoSchema), 'List of doctors for booking'),
  });

  app.openapi(listDoctorsRoute, async (c) => {
    const rows = await service.listDoctors(c);
    return c.json(ok(rows), 200);
  });

  // ─── GET /{id} — get by id ────────────────────────────────────────────────

  const getRoute = createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['appointments'],
    operationId: 'getAppointment',
    middleware: [requirePermission('appointment.view')] as const,
    request: {
      params: appointmentIdParamSchema,
    },
    responses: { ...okJson(appointmentDtoSchema, 'Appointment'), ...notFoundResponse },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.getById(c, id);
    if (!row) return c.json(fail('appointment.not_found', 'Appointment not found'), 404);
    return c.json(ok(toAppointmentDto(row)), 200);
  });

  // ─── PATCH /{id} — update ─────────────────────────────────────────────────

  const updateRoute = createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['appointments'],
    operationId: 'updateAppointment',
    middleware: [requirePermission('appointment.edit')] as const,
    request: {
      params: appointmentIdParamSchema,
      body: { content: { 'application/json': { schema: updateAppointmentSchema } } },
    },
    responses: {
      ...okJson(appointmentDtoSchema, 'Updated appointment'),
      ...notFoundResponse,
      ...conflictResponse,
    },
  });

  app.openapi(updateRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await service.update(c, id, body);
    if (!result.ok) {
      // Konflikt oilasi (409): doctor_busy + ish-soati/time-off guard'lari (A6).
      if (
        result.code === 'conflict.doctor_busy' ||
        result.code === 'schedule.outside_working_hours' ||
        result.code === 'schedule.doctor_on_time_off'
      )
        return c.json(fail(result.code, result.code), 409);
      if (result.code === 'not_found') return c.json(fail(result.code, result.code), 404);
      return c.json(fail(result.code, result.code), 400);
    }
    if (!result.appointment)
      return c.json(fail('appointment.not_found', 'Appointment not found'), 404);
    return c.json(ok(toAppointmentDto(result.appointment)), 200);
  });

  // ─── POST /{id}/cancel — cancel ───────────────────────────────────────────

  const cancelRoute = createRoute({
    method: 'post',
    path: '/{id}/cancel',
    tags: ['appointments'],
    operationId: 'cancelAppointment',
    middleware: [requirePermission('appointment.cancel')] as const,
    request: {
      params: appointmentIdParamSchema,
      body: {
        required: false,
        content: { 'application/json': { schema: cancelAppointmentBodySchema } },
      },
    },
    responses: {
      ...okJson(appointmentDtoSchema, 'Cancelled appointment'),
    },
  });

  app.openapi(cancelRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const result = await service.cancel(c, id, body?.reason);
    if (!result.ok) return c.json(fail(result.code, result.code), 400);
    if (!result.appointment)
      return c.json(fail('appointment.not_found', 'Appointment not found'), 400);
    return c.json(ok(toAppointmentDto(result.appointment)), 200);
  });

  return app;
};
