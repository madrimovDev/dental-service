import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import type { AppointmentsService } from '../appointments/appointments.service.ts';
import { toCheckInCandidateDto, toQueueTicketDto } from './queue.mapper.ts';
import {
  checkInCandidateDtoSchema,
  createQueueTicketSchema,
  queueTicketDtoSchema,
  queueTicketIdParamSchema,
  updateQueueStatusSchema,
} from './queue.schema.ts';
import { createQueueService, type QueueService, QueueValidationError } from './queue.service.ts';
import { QueueTransitionError } from './queue.transitions.ts';

/** Standart 404 response — ticket topilmadi. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Queue ticket not found',
  },
};

/** A5 (CLI-438): linked appointment validatsiyasi 400 kodlari — dublikat 409. */
const conflictQueueCodes = new Set(['queue.duplicate_ticket']);

export const queueRoutes = (deps: {
  db: Database;
  audit: AuditLogger;
  /**
   * CLI-425: shared appointment-completion path. app.ts appointmentsService'ni
   * bir marta qurib beradi (HANDOFF). Berilmasa queue legacy to'g'ridan db.update
   * yo'liga qaytadi (recall hook OTLAMAYDI).
   */
  appointmentsService?: Pick<AppointmentsService, 'update'>;
  /**
   * CLI-482: app.ts queueService'ni bir marta qurib beradi (teskari sync
   * `closeLinkedOpenTicket` uchun appointmentsService'ga ham inject qilinadi —
   * aylanma bog'liqlik deferred-ref bilan hal qilinadi). Berilmasa bu yerda
   * lokal quriladi (backward-safe: reverse-sync ulanmagan holat).
   */
  service?: QueueService;
}) => {
  const app = new OpenAPIHono();
  app.use('*', requireModuleInDesktop('queue'));
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service =
    deps.service ??
    createQueueService({
      audit: deps.audit,
      appointments: deps.appointmentsService,
    });

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
      409: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Duplicate open ticket for the linked appointment',
      },
    },
  });

  app.openapi(createRoute_, async (c) => {
    const body = c.req.valid('json');
    try {
      const ticket = await service.create(c, body);
      return c.json(ok(toQueueTicketDto(ticket)), 201);
    } catch (e) {
      // A5 (CLI-438): linked appointment validatsiyasi — mavjudlik/branch/patient/
      // status/dublikat. Dublikat 409 (conflict), qolgani 400.
      if (e instanceof QueueValidationError) {
        if (conflictQueueCodes.has(e.code)) return c.json(fail(e.code, e.code), 409);
        return c.json(fail(e.code, e.code), 400);
      }
      throw e;
    }
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
    responses: {
      ...okJson(queueTicketDtoSchema, 'Updated queue ticket'),
      ...notFoundResponse,
      400: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Invalid status transition',
      },
    },
  });

  app.openapi(updateStatusRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    let ticket: Awaited<ReturnType<typeof service.updateStatus>>;
    try {
      ticket = await service.updateStatus(c, id, body);
    } catch (e) {
      // A6 (CLI-438): state-machine violation → 400 (status.invalid_transition).
      if (e instanceof QueueTransitionError) return c.json(fail(e.code, e.message), 400);
      throw e;
    }
    if (!ticket) return c.json(fail('ticket.not_found', 'Queue ticket not found'), 404);
    return c.json(ok(toQueueTicketDto(ticket)), 200);
  });

  // ─── POST /sweep-no-shows — kun oxiri no-show sweep (A6, CLI-438) ────────
  // ⚠️ Cron/repeatable job registratsiyasi ULANMAGAN (lib/queue.ts + index.ts —
  // bu agent egaligidan tashqari); bu — qo'lda/kelajakdagi tashqi trigger uchun
  // manual endpoint (branch manager/admin `queue.manage` bilan).

  const sweepNoShowsRoute = createRoute({
    method: 'post',
    path: '/sweep-no-shows',
    tags: ['queue'],
    operationId: 'sweepQueueNoShows',
    middleware: [requirePermission('queue.manage')] as const,
    request: {
      body: {
        required: false,
        content: {
          'application/json': { schema: z.object({ branchId: z.uuid().optional() }) },
        },
      },
    },
    responses: okJson(z.object({ swept: z.number().int() }), 'Number of tickets marked missed'),
  });

  app.openapi(sweepNoShowsRoute, async (c) => {
    const body = c.req.valid('json');
    const swept = await service.sweepNoShows(c, body?.branchId);
    return c.json(ok({ swept }), 200);
  });

  return app;
};
