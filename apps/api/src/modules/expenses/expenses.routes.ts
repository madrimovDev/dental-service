import { fail, ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import {
  createCategorySchema,
  createExpenseSchema,
  listExpensesQuerySchema,
  summaryQuerySchema,
  updateCategorySchema,
  updateExpenseSchema,
} from './expenses.schema.ts';
import { createExpensesService } from './expenses.service.ts';

/**
 * Xarajatlar route'lari — bitta Hono app, `/api` ga mount qilinadi (patientImagesRoutes
 * precedenti). Ichida `/expense-categories`, `/expenses`, `/expenses/summary` (relativ).
 * Mount: `app.route('/api', expensesRoutes({ db, audit }))`.
 */
export const expensesRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createExpensesService({ audit: deps.audit });

  // ===== Kategoriyalar (expense.manage) =====

  app.get('/expense-categories', requirePermission('expense.manage'), async (c) => {
    return c.json(ok(await service.listCategories(c)));
  });

  app.post('/expense-categories', requirePermission('expense.manage'), async (c) => {
    const body = createCategorySchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    return c.json(ok(await service.createCategory(c, body.data)), 201);
  });

  app.patch('/expense-categories/:id', requirePermission('expense.manage'), async (c) => {
    const body = updateCategorySchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.updateCategory(c, c.req.param('id'), body.data);
    if (!row) return c.json(fail('expense_category.not_found', 'Category not found'), 404);
    return c.json(ok(row));
  });

  app.delete('/expense-categories/:id', requirePermission('expense.manage'), async (c) => {
    const row = await service.deleteCategory(c, c.req.param('id'));
    if (!row) return c.json(fail('expense_category.not_found', 'Category not found'), 404);
    return c.json(ok({ deleted: true, id: row.id }));
  });

  // ===== Xarajatlar =====

  // Svod — `/expenses/:id` dan OLDIN (route shadowing oldini olish).
  app.get('/expenses/summary', requirePermission('expense.view'), async (c) => {
    const query = summaryQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!query.success) throw new HTTPException(400, { message: 'Invalid query' });
    return c.json(ok(await service.summary(c, query.data)));
  });

  app.get('/expenses', requirePermission('expense.view'), async (c) => {
    const query = listExpensesQuerySchema.safeParse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    if (!query.success) throw new HTTPException(400, { message: 'Invalid query' });
    return c.json(ok(await service.list(c, query.data)));
  });

  app.post('/expenses', requirePermission('expense.manage'), async (c) => {
    const body = createExpenseSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    return c.json(ok(await service.create(c, body.data)), 201);
  });

  app.get('/expenses/:id', requirePermission('expense.view'), async (c) => {
    const row = await service.getById(c, c.req.param('id'));
    if (!row) return c.json(fail('expense.not_found', 'Expense not found'), 404);
    return c.json(ok(row));
  });

  app.patch('/expenses/:id', requirePermission('expense.manage'), async (c) => {
    const body = updateExpenseSchema.safeParse(await c.req.json());
    if (!body.success) throw new HTTPException(400, { message: 'Invalid input' });
    const row = await service.update(c, c.req.param('id'), body.data);
    if (!row) return c.json(fail('expense.not_found', 'Expense not found'), 404);
    return c.json(ok(row));
  });

  app.delete('/expenses/:id', requirePermission('expense.manage'), async (c) => {
    const row = await service.remove(c, c.req.param('id'));
    if (!row) return c.json(fail('expense.not_found', 'Expense not found'), 404);
    return c.json(ok({ deleted: true, id: row.id }));
  });

  return app;
};
