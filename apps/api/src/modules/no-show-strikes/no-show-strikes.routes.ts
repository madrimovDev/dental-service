import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toNoShowStrikeDto } from './no-show-strikes.mapper.ts';
import {
  patientStrikesSummaryDtoSchema,
  strikeIdParamSchema,
  strikePatientIdParamSchema,
  waivedStrikeDtoSchema,
  waiveStrikeSchema,
} from './no-show-strikes.schema.ts';
import { createNoShowStrikesService } from './no-show-strikes.service.ts';

export const noShowStrikeRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createNoShowStrikesService({ audit: deps.audit });

  // ─── GET /no-show-strikes/patient/{patientId} — bemor strike xulosasi ────────
  const summaryRoute = createRoute({
    method: 'get',
    path: '/patient/{patientId}',
    tags: ['no-show-strikes'],
    operationId: 'getPatientNoShowStrikes',
    middleware: [requirePermission('patient.view')] as const,
    request: { params: strikePatientIdParamSchema },
    responses: okJson(patientStrikesSummaryDtoSchema, 'Patient no-show strike summary'),
  });
  app.openapi(summaryRoute, async (c) => {
    const { patientId } = c.req.valid('param');
    const s = await service.patientSummary(c, patientId);
    return c.json(ok({ ...s, strikes: s.strikes.map(toNoShowStrikeDto) }), 200);
  });

  // ─── POST /no-show-strikes/{id}/waive — strike'ni kechirish ──────────────────
  // Yangi permission YARATILMAYDI (CLI-153 darsi) — registratura allaqachon ega
  // `appointment.edit` ("o'tkazib yuborilgan yozilishni kechirish" tabiiy mos).
  const waiveRoute = createRoute({
    method: 'post',
    path: '/{id}/waive',
    tags: ['no-show-strikes'],
    operationId: 'waiveNoShowStrike',
    middleware: [requirePermission('appointment.edit')] as const,
    request: {
      params: strikeIdParamSchema,
      body: { content: { 'application/json': { schema: waiveStrikeSchema } } },
    },
    responses: {
      ...okJson(waivedStrikeDtoSchema, 'Strike waived'),
      404: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Strike not found',
      },
      409: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Strike already waived',
      },
    },
  });
  app.openapi(waiveRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { reason } = c.req.valid('json');
    const res = await service.waive(c, id, { reason: reason ?? null });
    if (!res.ok) {
      return c.json(fail(res.code, res.code), res.code === 'not_found' ? 404 : 409);
    }
    return c.json(ok({ id: res.strike?.id ?? id, waived: res.strike?.waived ?? true }), 200);
  });

  return app;
};
