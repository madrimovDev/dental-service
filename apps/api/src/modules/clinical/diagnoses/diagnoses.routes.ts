import { ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../../db/client.ts';
import { okJson } from '../../../lib/openapi.ts';
import { requirePermission } from '../../../middleware/require-permission.ts';
import { toDiagnosisDto } from './diagnoses.mapper.ts';
import { diagnosisDtoSchema } from './diagnoses.schema.ts';
import { createDiagnosesService } from './diagnoses.service.ts';

export const diagnosesRoutes = (deps: { db: Database }) => {
  const app = new OpenAPIHono();
  const service = createDiagnosesService(deps);

  const listRoute = createRoute({
    method: 'get',
    path: '/diagnoses',
    tags: ['diagnoses'],
    operationId: 'listDiagnoses',
    middleware: [requirePermission('medical_record.view')] as const,
    request: {
      query: z.object({
        search: z.string().optional().openapi({ description: 'Search by code or name' }),
      }),
    },
    responses: okJson(z.array(diagnosisDtoSchema), 'ICD-10 diagnosis catalog'),
  });

  app.openapi(listRoute, async (c) => {
    const { search } = c.req.valid('query');
    const rows = await service.list(search);
    return c.json(ok(rows.map(toDiagnosisDto)), 200);
  });

  return app;
};
