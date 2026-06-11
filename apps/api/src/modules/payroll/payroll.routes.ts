import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { createRunSchema } from './payroll.schema.ts';
import { createPayrollService } from './payroll.service.ts';

export const payrollRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createPayrollService({ audit: deps.audit });

  app.get('/runs', requirePermission('payroll.view'), async (c) =>
    c.json(ok(await service.listRuns(c))),
  );

  app.post('/runs', requirePermission('payroll.manage'), async (c) => {
    const body = createRunSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    return c.json(ok(await service.createRun(c, body.data)), 201);
  });

  app.get('/runs/:id', requirePermission('payroll.view'), async (c) => {
    const run = await service.getRun(c, c.req.param('id'));
    if (!run) return c.json(fail('payroll_run.not_found', 'Payroll run not found'), 404);
    return c.json(ok(run));
  });

  app.post('/runs/:id/finalize', requirePermission('payroll.manage'), async (c) => {
    const { run, error } = await service.finalizeRun(c, c.req.param('id'));
    if (error === 'not_found') {
      return c.json(fail('payroll_run.not_found', 'Payroll run not found'), 404);
    }
    if (error === 'not_draft') {
      return c.json(fail('payroll_run.not_draft', 'Only draft runs can be finalized'), 400);
    }
    return c.json(ok(run));
  });

  return app;
};
