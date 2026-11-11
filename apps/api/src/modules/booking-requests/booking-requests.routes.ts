import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { errorResponseSchema, okJson } from '../../lib/openapi.ts';
import type { PatientMessenger } from '../../lib/telegram/notify.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { AppointmentTransitionError } from '../appointments/appointments.transitions.ts';
import type { AppointmentsService } from '../appointments/index.ts';
import {
  bookingRequestDecisionSchema,
  bookingRequestIdParamSchema,
  bookingRequestListSchema,
  confirmBookingRequestSchema,
  declineBookingRequestSchema,
  listBookingRequestsQuery,
} from './booking-requests.schema.ts';
import { createBookingRequestsService } from './booking-requests.service.ts';

const errResp = (description: string) => ({
  content: { 'application/json': { schema: errorResponseSchema } },
  description,
});

export const bookingRequestRoutes = (deps: {
  db: Database;
  audit: AuditLogger;
  appointments: Pick<AppointmentsService, 'create' | 'update'>;
  messenger?: PatientMessenger;
}) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createBookingRequestsService({
    audit: deps.audit,
    appointments: deps.appointments,
    messenger: deps.messenger,
  });

  // ─── GET /booking-requests?status=pending — «Bugun» ekrani Telegram bloki ───
  const listRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['booking-requests'],
    operationId: 'listBookingRequests',
    middleware: [requirePermission('appointment.view')] as const,
    request: { query: listBookingRequestsQuery },
    responses: okJson(bookingRequestListSchema, 'Telegram booking requests'),
  });
  app.openapi(listRoute, async (c) => {
    const query = c.req.valid('query');
    return c.json(ok(await service.list(c, query)), 200);
  });

  // ─── POST /booking-requests/{id}/confirm ────────────────────────────────────
  const confirmRoute = createRoute({
    method: 'post',
    path: '/{id}/confirm',
    tags: ['booking-requests'],
    operationId: 'confirmBookingRequest',
    middleware: [requirePermission('appointment.create')] as const,
    request: {
      params: bookingRequestIdParamSchema,
      body: { content: { 'application/json': { schema: confirmBookingRequestSchema } } },
    },
    responses: {
      ...okJson(bookingRequestDecisionSchema, 'Booking request confirmed, appointment created'),
      404: errResp('Booking request not found'),
      409: errResp('Slot is no longer available / request already decided (request stays pending)'),
    },
  });
  app.openapi(confirmRoute, async (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    try {
      const res = await service.confirm(c, id, input);
      if (res.ok) {
        return c.json(
          ok({ id: res.id, status: res.status, appointmentId: res.appointmentId }),
          200,
        );
      }
      if (res.code === 'not_found') return c.json(fail(res.code, res.code), 404);
      return c.json(fail(res.code, res.code), res.conflict ? 409 : 400);
    } catch (e) {
      if (e instanceof AppointmentTransitionError) return c.json(fail(e.code, e.message), 400);
      throw e;
    }
  });

  // ─── POST /booking-requests/{id}/decline ────────────────────────────────────
  const declineRoute = createRoute({
    method: 'post',
    path: '/{id}/decline',
    tags: ['booking-requests'],
    operationId: 'declineBookingRequest',
    middleware: [requirePermission('appointment.create')] as const,
    request: {
      params: bookingRequestIdParamSchema,
      body: { content: { 'application/json': { schema: declineBookingRequestSchema } } },
    },
    responses: {
      ...okJson(bookingRequestDecisionSchema, 'Booking request declined'),
      404: errResp('Booking request not found'),
      409: errResp('Request already decided'),
    },
  });
  app.openapi(declineRoute, async (c) => {
    const { id } = c.req.valid('param');
    const input = c.req.valid('json');
    const res = await service.decline(c, id, input);
    if (res.ok) {
      return c.json(ok({ id: res.id, status: res.status, appointmentId: null }), 200);
    }
    return c.json(fail(res.code, res.code), res.code === 'not_found' ? 404 : 409);
  });

  return app;
};
