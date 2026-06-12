import { fail, ok } from '@dental/core';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toExpenseCategoryDto, toExpenseDto } from './expenses.mapper.ts';
import {
  createCategorySchema,
  createExpenseSchema,
  expenseCategoryDtoSchema,
  expenseDeleteResultSchema,
  expenseDtoSchema,
  expenseIdParamSchema,
  expenseListResponseSchema,
  expenseSummarySchema,
  listExpensesQuerySchema,
  summaryQuerySchema,
  updateCategorySchema,
  updateExpenseSchema,
} from './expenses.schema.ts';
import { createExpensesService } from './expenses.service.ts';

/** Standart 404 (kategoriya). */
const categoryNotFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Category not found',
  },
};

/** Standart 404 (xarajat). */
const expenseNotFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Expense not found',
  },
};

/**
 * Xarajatlar route'lari — bitta OpenAPIHono app, `/api` ga mount qilinadi.
 * Ichida `/expense-categories`, `/expenses`, `/expenses/summary` (relativ).
 * Mount: `app.route('/api', expensesRoutes({ db, audit }))`.
 *
 * Eslatma: `/expenses/summary` `/expenses/{id}` dan OLDIN ro'yxatdan o'tadi
 * (Hono registratsiya tartibida mos keladi — route shadowing oldini olish).
 */
export const expensesRoutes = (deps: { db: Database; audit: AuditLogger }) => {
  const app = new OpenAPIHono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createExpensesService({ audit: deps.audit });

  // ===== Kategoriyalar (expense.manage) =====

  // ─── GET /expense-categories — list ──────────────────────────────────────
  const listCategoriesRoute = createRoute({
    method: 'get',
    path: '/expense-categories',
    tags: ['expenses'],
    operationId: 'listExpenseCategories',
    middleware: [requirePermission('expense.manage')] as const,
    responses: okJson(z.array(expenseCategoryDtoSchema), 'List of expense categories'),
  });

  app.openapi(listCategoriesRoute, async (c) => {
    const rows = await service.listCategories(c);
    return c.json(ok(rows.map(toExpenseCategoryDto)), 200);
  });

  // ─── POST /expense-categories — create ───────────────────────────────────
  const createCategoryRoute = createRoute({
    method: 'post',
    path: '/expense-categories',
    tags: ['expenses'],
    operationId: 'createExpenseCategory',
    middleware: [requirePermission('expense.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createCategorySchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(expenseCategoryDtoSchema) } },
        description: 'Expense category created',
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

  app.openapi(createCategoryRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.createCategory(c, body);
    return c.json(ok(toExpenseCategoryDto(row)), 201);
  });

  // ─── PATCH /expense-categories/{id} — update ─────────────────────────────
  const updateCategoryRoute = createRoute({
    method: 'patch',
    path: '/expense-categories/{id}',
    tags: ['expenses'],
    operationId: 'updateExpenseCategory',
    middleware: [requirePermission('expense.manage')] as const,
    request: {
      params: expenseIdParamSchema,
      body: { content: { 'application/json': { schema: updateCategorySchema } } },
    },
    responses: {
      ...okJson(expenseCategoryDtoSchema, 'Updated category'),
      ...categoryNotFoundResponse,
    },
  });

  app.openapi(updateCategoryRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.updateCategory(c, id, body);
    if (!row) return c.json(fail('expense_category.not_found', 'Category not found'), 404);
    return c.json(ok(toExpenseCategoryDto(row)), 200);
  });

  // ─── DELETE /expense-categories/{id} — delete ────────────────────────────
  const deleteCategoryRoute = createRoute({
    method: 'delete',
    path: '/expense-categories/{id}',
    tags: ['expenses'],
    operationId: 'deleteExpenseCategory',
    middleware: [requirePermission('expense.manage')] as const,
    request: { params: expenseIdParamSchema },
    responses: {
      ...okJson(expenseDeleteResultSchema, 'Category deleted'),
      ...categoryNotFoundResponse,
    },
  });

  app.openapi(deleteCategoryRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.deleteCategory(c, id);
    if (!row) return c.json(fail('expense_category.not_found', 'Category not found'), 404);
    return c.json(ok({ deleted: true as const }), 200);
  });

  // ===== Xarajatlar =====

  // ─── GET /expenses/summary — svod (/{id} dan OLDIN) ──────────────────────
  const summaryRoute = createRoute({
    method: 'get',
    path: '/expenses/summary',
    tags: ['expenses'],
    operationId: 'expenseSummary',
    middleware: [requirePermission('expense.view')] as const,
    request: { query: summaryQuerySchema },
    responses: okJson(expenseSummarySchema, 'Expense summary by category'),
  });

  app.openapi(summaryRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await service.summary(c, query);
    return c.json(ok(result), 200);
  });

  // ─── GET /expenses — list ────────────────────────────────────────────────
  const listRoute = createRoute({
    method: 'get',
    path: '/expenses',
    tags: ['expenses'],
    operationId: 'listExpenses',
    middleware: [requirePermission('expense.view')] as const,
    request: { query: listExpensesQuerySchema },
    responses: okJson(expenseListResponseSchema, 'Paginated expenses'),
  });

  app.openapi(listRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await service.list(c, query);
    return c.json(ok({ data: result.data.map(toExpenseDto), meta: result.meta }), 200);
  });

  // ─── POST /expenses — create ─────────────────────────────────────────────
  const createExpenseRoute = createRoute({
    method: 'post',
    path: '/expenses',
    tags: ['expenses'],
    operationId: 'createExpense',
    middleware: [requirePermission('expense.manage')] as const,
    request: {
      body: { content: { 'application/json': { schema: createExpenseSchema } } },
    },
    responses: {
      201: {
        content: { 'application/json': { schema: apiResponseSchema(expenseDtoSchema) } },
        description: 'Expense created',
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

  app.openapi(createExpenseRoute, async (c) => {
    const body = c.req.valid('json');
    const row = await service.create(c, body);
    return c.json(ok(toExpenseDto(row)), 201);
  });

  // ─── GET /expenses/{id} — get by id ──────────────────────────────────────
  const getRoute = createRoute({
    method: 'get',
    path: '/expenses/{id}',
    tags: ['expenses'],
    operationId: 'getExpense',
    middleware: [requirePermission('expense.view')] as const,
    request: { params: expenseIdParamSchema },
    responses: { ...okJson(expenseDtoSchema, 'Expense'), ...expenseNotFoundResponse },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.getById(c, id);
    if (!row) return c.json(fail('expense.not_found', 'Expense not found'), 404);
    return c.json(ok(toExpenseDto(row)), 200);
  });

  // ─── PATCH /expenses/{id} — update ───────────────────────────────────────
  const updateExpenseRoute = createRoute({
    method: 'patch',
    path: '/expenses/{id}',
    tags: ['expenses'],
    operationId: 'updateExpense',
    middleware: [requirePermission('expense.manage')] as const,
    request: {
      params: expenseIdParamSchema,
      body: { content: { 'application/json': { schema: updateExpenseSchema } } },
    },
    responses: { ...okJson(expenseDtoSchema, 'Updated expense'), ...expenseNotFoundResponse },
  });

  app.openapi(updateExpenseRoute, async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const row = await service.update(c, id, body);
    if (!row) return c.json(fail('expense.not_found', 'Expense not found'), 404);
    return c.json(ok(toExpenseDto(row)), 200);
  });

  // ─── DELETE /expenses/{id} — delete ──────────────────────────────────────
  const deleteExpenseRoute = createRoute({
    method: 'delete',
    path: '/expenses/{id}',
    tags: ['expenses'],
    operationId: 'deleteExpense',
    middleware: [requirePermission('expense.manage')] as const,
    request: { params: expenseIdParamSchema },
    responses: {
      ...okJson(expenseDeleteResultSchema, 'Expense deleted'),
      ...expenseNotFoundResponse,
    },
  });

  app.openapi(deleteExpenseRoute, async (c) => {
    const { id } = c.req.valid('param');
    const row = await service.remove(c, id);
    if (!row) return c.json(fail('expense.not_found', 'Expense not found'), 404);
    return c.json(ok({ deleted: true as const }), 200);
  });

  return app;
};
