import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { createTransactionSchema, listTransactionsQuery } from './cashier.schema.ts';
import { AllocationExceedError, createCashierService } from './cashier.service.ts';

export const cashierRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createCashierService({ audit: deps.audit });

  app.get('/transactions', requirePermission('cashier.view'), async (c) => {
    const query = listTransactionsQuery.safeParse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    if (!query.success) throw new HTTPException(400, { message: 'Invalid query' });
    return c.json(ok(await service.list(c, query.data)));
  });

  app.post('/transactions', requirePermission('cashier.create_transaction'), async (c) => {
    const body = createTransactionSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    try {
      const tx = await service.create(c, body.data);
      return c.json(ok(tx), 201);
    } catch (e) {
      if (e instanceof AllocationExceedError) {
        return c.json(fail('allocations.exceed', 'Allocation sum exceeds paid amount'), 400);
      }
      throw e;
    }
  });

  app.get('/transactions/:id', requirePermission('cashier.view'), async (c) => {
    const tx = await service.getById(c, c.req.param('id'));
    if (!tx) return c.json(fail('transaction.not_found', 'Transaction not found'), 404);
    return c.json(ok(tx));
  });

  app.post('/transactions/:id/refund', requirePermission('cashier.refund'), async (c) => {
    const tx = await service.refund(c, c.req.param('id'));
    if (!tx) return c.json(fail('refund.invalid', 'Cannot refund'), 400);
    return c.json(ok(tx));
  });

  app.get('/daily-summary', requirePermission('cashier.view'), async (c) => {
    const branchId = c.req.query('branchId');
    const date = c.req.query('date') ?? new Date().toISOString().slice(0, 10);
    if (!branchId) return c.json(fail('query.missing', 'branchId required'), 400);
    return c.json(ok(await service.dailySummary(c, branchId, date)));
  });

  app.get('/plan-balance/:planId', requirePermission('cashier.view'), async (c) => {
    return c.json(ok(await service.planBalance(c, c.req.param('planId'))));
  });

  return app;
};
