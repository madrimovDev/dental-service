import { ok } from '@dental/core';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import { okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  toAppointmentStatsReportDto,
  toDoctorWorkloadReportDto,
  toPlanCompletionReportDto,
  toRevenueReportDto,
} from './reports.mapper.ts';
import {
  appointmentStatsReportDtoSchema,
  doctorWorkloadReportDtoSchema,
  planCompletionReportDtoSchema,
  reportRangeSchema,
  revenueReportDtoSchema,
} from './reports.schema.ts';
import { createReportsService } from './reports.service.ts';

export const reportsRoutes = (deps: { db: Database }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createReportsService();

  // ─── GET /revenue ──────────────────────────────────────────────────────────

  const revenueRoute = createRoute({
    method: 'get',
    path: '/revenue',
    tags: ['reports'],
    operationId: 'getRevenueReport',
    middleware: [requirePermission('report.view')] as const,
    request: { query: reportRangeSchema },
    responses: okJson(revenueReportDtoSchema, 'Revenue report'),
  });

  app.openapi(revenueRoute, async (c) => {
    const range = c.req.valid('query');
    const result = await service.revenue(c, range);
    return c.json(ok(toRevenueReportDto(result)), 200);
  });

  // ─── GET /appointments ───────────────────────────────────────────────────────

  const appointmentsRoute = createRoute({
    method: 'get',
    path: '/appointments',
    tags: ['reports'],
    operationId: 'getAppointmentStatsReport',
    middleware: [requirePermission('report.view')] as const,
    request: { query: reportRangeSchema },
    responses: okJson(appointmentStatsReportDtoSchema, 'Appointment statistics report'),
  });

  app.openapi(appointmentsRoute, async (c) => {
    const range = c.req.valid('query');
    const result = await service.appointmentStats(c, range);
    return c.json(ok(toAppointmentStatsReportDto(result)), 200);
  });

  // ─── GET /doctors ────────────────────────────────────────────────────────────

  const doctorsRoute = createRoute({
    method: 'get',
    path: '/doctors',
    tags: ['reports'],
    operationId: 'getDoctorWorkloadReport',
    middleware: [requirePermission('report.view')] as const,
    request: { query: reportRangeSchema },
    responses: okJson(doctorWorkloadReportDtoSchema, 'Doctor workload report'),
  });

  app.openapi(doctorsRoute, async (c) => {
    const range = c.req.valid('query');
    const rows = await service.doctorWorkload(c, range);
    return c.json(ok(toDoctorWorkloadReportDto(rows)), 200);
  });

  // ─── GET /treatment-plans ─────────────────────────────────────────────────────

  const treatmentPlansRoute = createRoute({
    method: 'get',
    path: '/treatment-plans',
    tags: ['reports'],
    operationId: 'getPlanCompletionReport',
    middleware: [requirePermission('report.view')] as const,
    request: { query: reportRangeSchema },
    responses: okJson(planCompletionReportDtoSchema, 'Treatment plan completion report'),
  });

  app.openapi(treatmentPlansRoute, async (c) => {
    const range = c.req.valid('query');
    const result = await service.planCompletion(c, range);
    return c.json(ok(toPlanCompletionReportDto(result)), 200);
  });

  return app;
};
