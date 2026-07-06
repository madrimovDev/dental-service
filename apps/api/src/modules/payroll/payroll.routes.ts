import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toPayrollRunDto, toPayrollRunWithLinesDto } from './payroll.mapper.ts';
import {
  createRunSchema,
  payrollRunDtoSchema,
  payrollRunWithLinesDtoSchema,
  runIdParamSchema,
} from './payroll.schema.ts';
import { createPayrollService, PayrollOverlapError } from './payroll.service.ts';

/** Standart 404 response — get/finalize endpoint'lar uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Payroll run not found',
  },
};

export const payrollRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createPayrollService({ audit: deps.audit });

  // ─── GET /runs — list ─────────────────────────────────────────────────────

  const listRunsRoute = createRoute({
    method: 'get',
    path: '/runs',
    tags: ['payroll'],
    operationId: 'listPayrollRuns',
    middleware: [requirePermission('payroll.view')] as const,
    responses: okJson(z.array(payrollRunDtoSchema), 'List of payroll runs'),
  });

  app.openapi(listRunsRoute, async (c) => {
    const rows = await service.listRuns(c);
    return c.json(ok(rows.map(toPayrollRunDto)), 200);
  });

  // ─── POST /runs — create (snapshot run) ──────────────────────────────────

  const createRunRoute = createRoute({
    method: 'post',
    path: '/runs',
    tags: ['payroll'],
    operationId: 'createPayrollRun',
    middleware: [requirePermission('payroll.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createRunSchema } } },
    },
    responses: {
      201: {
        content: {
          'application/json': { schema: apiResponseSchema(payrollRunWithLinesDtoSchema) },
        },
        description: 'Payroll run created with snapshot lines',
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
        description: 'Overlapping / duplicate payroll run for period',
      },
    },
  });

  app.openapi(createRunRoute, async (c) => {
    const body = c.req.valid('json');
    try {
      const result = await service.createRun(c, body);
      const { lines, ...run } = result;
      return c.json(ok(toPayrollRunWithLinesDto(run, lines)), 201);
    } catch (err) {
      if (err instanceof PayrollOverlapError) {
        return c.json(
          fail('payroll_run.overlap', 'A payroll run already exists for an overlapping period'),
          409,
        );
      }
      throw err;
    }
  });

  // ─── GET /runs/{id} — get by id ───────────────────────────────────────────

  const getRunRoute = createRoute({
    method: 'get',
    path: '/runs/{id}',
    tags: ['payroll'],
    operationId: 'getPayrollRun',
    middleware: [requirePermission('payroll.view')] as const,
    request: {
      params: runIdParamSchema,
    },
    responses: {
      ...okJson(payrollRunWithLinesDtoSchema, 'Payroll run with lines'),
      ...notFoundResponse,
    },
  });

  app.openapi(getRunRoute, async (c) => {
    const { id } = c.req.valid('param');
    const result = await service.getRun(c, id);
    if (!result) return c.json(fail('payroll_run.not_found', 'Payroll run not found'), 404);
    const { lines, ...run } = result;
    return c.json(ok(toPayrollRunWithLinesDto(run, lines)), 200);
  });

  // ─── POST /runs/{id}/finalize — finalize draft ────────────────────────────

  const finalizeRunRoute = createRoute({
    method: 'post',
    path: '/runs/{id}/finalize',
    tags: ['payroll'],
    operationId: 'finalizePayrollRun',
    middleware: [requirePermission('payroll.manage')] as const,
    request: {
      params: runIdParamSchema,
    },
    responses: {
      ...okJson(payrollRunDtoSchema, 'Finalized payroll run'),
      ...notFoundResponse,
      400: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Run is not in draft status',
      },
    },
  });

  app.openapi(finalizeRunRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { run, error } = await service.finalizeRun(c, id);
    if (error === 'not_found') {
      return c.json(fail('payroll_run.not_found', 'Payroll run not found'), 404);
    }
    if (error === 'not_draft') {
      return c.json(fail('payroll_run.not_draft', 'Only draft runs can be finalized'), 400);
    }
    if (!run) {
      return c.json(fail('payroll_run.not_found', 'Payroll run not found'), 404);
    }
    return c.json(ok(toPayrollRunDto(run)), 200);
  });

  // ─── DELETE /runs/{id} — draft'ni o'chirish (deadlock yechimi) ─────────────

  const deleteRunRoute = createRoute({
    method: 'delete',
    path: '/runs/{id}',
    tags: ['payroll'],
    operationId: 'deletePayrollRun',
    middleware: [requirePermission('payroll.manage')] as const,
    request: {
      params: runIdParamSchema,
    },
    responses: {
      ...okJson(z.object({ deleted: z.literal(true) }), 'Payroll run deleted'),
      ...notFoundResponse,
      409: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Only draft runs can be deleted',
      },
    },
  });

  app.openapi(deleteRunRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { error } = await service.deleteRun(c, id);
    if (error === 'not_found') {
      return c.json(fail('payroll_run.not_found', 'Payroll run not found'), 404);
    }
    if (error === 'not_draft') {
      return c.json(fail('payroll_run.not_draft', 'Only draft runs can be deleted'), 409);
    }
    return c.json(ok({ deleted: true as const }), 200);
  });

  return app;
};
