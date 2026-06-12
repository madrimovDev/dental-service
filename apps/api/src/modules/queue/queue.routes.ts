import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toCheckInCandidateDto, toQueueTicketDto } from './queue.mapper.ts';
import {
  checkInCandidateDtoSchema,
  createQueueTicketSchema,
  queueTicketDtoSchema,
  queueTicketIdParamSchema,
  updateQueueStatusSchema,
} from './queue.schema.ts';
import { createQueueService } from './queue.service.ts';

/** Standart 404 response — ticket topilmadi. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Queue ticket not found',
  },
};

export const queueRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createQueueService({ audit: deps.audit });

  // ─── GET / — today's queue list ──────────────────────────────────────────

  const todayListRoute = createRoute({
    method: 'get',
    path: '/',
    tags: ['queue'],
    operationId: 'getQueueToday',
    middleware: [requirePermission('queue.view')] as const,
    request: {
      query: z.object({ branchId: z.uuid() }),
    },
    responses: okJson(z.array(queueTicketDtoSchema), "Today's queue tickets for a branch"),
  });

  app.openapi(todayListRoute, async (c) => {
    const { branchId } = c.req.valid('query');
    const rows = await service.todayList(c, branchId);
    return c.json(ok(rows.map(toQueueTicketDto)), 200);
  });

  // ─── GET /check-in-candidates — unqueued today's appointments ────────────

  const checkInCandidatesRoute = createRoute({
    method: 'get',
    path: '/check-in-candidates',
    tags: ['queue'],
    operationId: 'getCheckInCandidates',
    middleware: [requirePermission('queue.create')] as const,
    request: {
      query: z.object({ branchId: z.uuid() }),
    },
    responses: okJson(
      z.array(checkInCandidateDtoSchema),
      "Today's scheduled/confirmed appointments not yet queued",
    ),
  });

  app.openapi(checkInCandidatesRoute, async (c) => {
    const { branchId } = c.req.valid('query');
    const rows = await service.checkInCandidates(c, branchId);
    return c.json(ok(rows.map(toCheckInCandidateDto)), 200);
  });

  // ─── POST / — create ticket ───────────────────────────────────────────────

  const createRoute_ = createRoute({
    method: 'post',
    path: '/',
    tags: ['queue'],
    operationId: 'createQueueTicket',
    middleware: [requirePermission('queue.create')] as const,
    request: {
      body: { content: { 'application/json': { schema: createQueueTicketSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(queueTicketDtoSchema) } },
        description: 'Queue ticket created',
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
    const ticket = await service.create(c, body);
    return c.json(ok(toQueueTicketDto(ticket)), 201);
  });

  // ─── PATCH /{id}/status — update ticket status ───────────────────────────

  const updateStatusRoute = createRoute({
    method: 'patch',
    path: '/{id}/status',
    tags: ['queue'],
    operationId: 'updateQueueTicketStatus',
    middleware: [requirePermission('queue.manage')] as const,
    request: {
      params: queueTicketIdParamSchema,
      body: { content: { 'application/json': { schema: updateQueueStatusSchema } } },
    },
    responses: { ...okJson(queueTicketDtoSchema, 'Updated queue ticket'), ...notFoundResponse },
  });

  app.openapi(updateStatusRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const ticket = await service.updateStatus(c, id, body);
    if (!ticket) return c.json(fail('ticket.not_found', 'Queue ticket not found'), 404);
    return c.json(ok(toQueueTicketDto(ticket)), 200);
  });

  return app;
};
