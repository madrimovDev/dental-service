import { fail, ok } from '@dental/core';
import type { FiscalProvider } from '@dental/fiscal';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import type { Database } from '../../db/client.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { requireModuleInDesktop } from '../../lib/license-middleware.ts';
import { apiResponseSchema, errorResponseSchema, okJson } from '../../lib/openapi.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { toCashierTransactionDto, toCashierTransactionWithItemsDto } from './cashier.mapper.ts';
import {
  cashierListResponseDtoSchema,
  cashierPatientPlanDtoSchema,
  cashierTransactionWithItemsDtoSchema,
  createTransactionSchema,
  dailySummaryDtoSchema,
  dailySummaryQuery,
  listTransactionsQuery,
  patientPlansQuery,
  planBalanceDtoSchema,
  planIdParamSchema,
  refundRequestSchema,
  transactionIdParamSchema,
} from './cashier.schema.ts';
import {
  AllocationExceedError,
  createCashierService,
  DiscountExceedsTotalError,
  NoActivePriceError,
  type PayrollAdjustmentHook,
  type PriceLookup,
} from './cashier.service.ts';

/** Standart 404 — get by id uchun. */
const notFoundResponse = {
  404: {
    content: { 'application/json': { schema: errorResponseSchema } },
    description: 'Transaction not found',
  },
};

export const cashierRoutes = (deps: {
  db: Database;
  audit: AuditLogger;
  fiscal?: FiscalProvider;
  /** CLI-443: POS item narxini serverda hisoblash uchun (services.service.ts::getActivePrice). */
  priceLookup: PriceLookup;
  /** CLI-446 G3: refund finalized payroll davriga tushsa carry-forward tuzatish yozish uchun. */
  payrollAdjustment?: PayrollAdjustmentHook;
}) => {
  const app = new OpenAPIHono();
  app.use('*', requireModuleInDesktop('cashier'));
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));

  const service = createCashierService({
    audit: deps.audit,
    fiscal: deps.fiscal,
    priceLookup: deps.priceLookup,
    payrollAdjustment: deps.payrollAdjustment,
  });

  // ─── GET /transactions — list (paginated) ────────────────────────────────

  const listRoute = createRoute({
    method: 'get',
    path: '/transactions',
    tags: ['cashier'],
    operationId: 'listCashierTransactions',
    middleware: [requirePermission('cashier.view')] as const,
    request: { query: listTransactionsQuery },
    responses: okJson(cashierListResponseDtoSchema, 'Paginated cashier transactions'),
  });

  app.openapi(listRoute, async (c) => {
    const query = c.req.valid('query');
    const result = await service.list(c, query);
    return c.json(ok({ data: result.data.map(toCashierTransactionDto), meta: result.meta }), 200);
  });

  // ─── POST /transactions — create ─────────────────────────────────────────

  const createTransactionRoute = createRoute({
    method: 'post',
    path: '/transactions',
    tags: ['cashier'],
    operationId: 'createCashierTransaction',
    middleware: [requirePermission('cashier.create_transaction')] as const,
    request: {
      body: { content: { 'application/json': { schema: createTransactionSchema } } },
    },
    responses: {
      201: {
        content: {
          'application/json': { schema: apiResponseSchema(cashierTransactionWithItemsDtoSchema) },
        },
        description: 'Transaction created',
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

  app.openapi(createTransactionRoute, async (c) => {
    const body = c.req.valid('json');
    try {
      const tx = await service.create(c, body);
      return c.json(ok(toCashierTransactionWithItemsDto(tx, tx.items)), 201);
    } catch (e) {
      if (e instanceof AllocationExceedError) {
        return c.json(fail('allocations.exceed', 'Allocation sum exceeds paid amount'), 400);
      }
      if (e instanceof NoActivePriceError) {
        return c.json(
          fail('cashier.no_active_price', 'No active price for this service at this branch'),
          400,
        );
      }
      if (e instanceof DiscountExceedsTotalError) {
        return c.json(
          fail('cashier.discount_exceeds_total', 'Discount exceeds items gross total'),
          400,
        );
      }
      throw e;
    }
  });

  // ─── GET /transactions/{id} — get by id ──────────────────────────────────

  const getRoute = createRoute({
    method: 'get',
    path: '/transactions/{id}',
    tags: ['cashier'],
    operationId: 'getCashierTransaction',
    middleware: [requirePermission('cashier.view')] as const,
    request: { params: transactionIdParamSchema },
    responses: {
      ...okJson(cashierTransactionWithItemsDtoSchema, 'Transaction with items'),
      ...notFoundResponse,
    },
  });

  app.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param');
    const tx = await service.getById(c, id);
    if (!tx) return c.json(fail('transaction.not_found', 'Transaction not found'), 404);
    return c.json(ok(toCashierTransactionWithItemsDto(tx, tx.items)), 200);
  });

  // ─── POST /transactions/{id}/refund — refund ─────────────────────────────

  const refundRoute = createRoute({
    method: 'post',
    path: '/transactions/{id}/refund',
    tags: ['cashier'],
    operationId: 'refundCashierTransaction',
    middleware: [requirePermission('cashier.refund')] as const,
    request: {
      params: transactionIdParamSchema,
      body: { content: { 'application/json': { schema: refundRequestSchema } } },
    },
    responses: {
      ...okJson(cashierTransactionWithItemsDtoSchema, 'Refund transaction'),
      400: {
        content: { 'application/json': { schema: errorResponseSchema } },
        description: 'Cannot refund',
      },
    },
  });

  app.openapi(refundRoute, async (c) => {
    const { id } = c.req.valid('param');
    const { amount } = c.req.valid('json');
    const res = await service.refund(c, id, amount);
    if (!res.ok) {
      const msg =
        res.reason === 'over_refund'
          ? 'Refund exceeds remaining paid amount'
          : res.reason === 'non_plan_partial'
            ? 'Partial refund only supported for plan-linked payments'
            : 'Cannot refund';
      return c.json(fail(`refund.${res.reason}`, msg), 400);
    }
    // refund row items'siz keladi — wire shaklida `items: []`.
    return c.json(ok(toCashierTransactionWithItemsDto(res.refund)), 200);
  });

  // ─── GET /daily-summary — kassa yopilishi ────────────────────────────────

  const dailySummaryRoute = createRoute({
    method: 'get',
    path: '/daily-summary',
    tags: ['cashier'],
    operationId: 'getCashierDailySummary',
    middleware: [requirePermission('cashier.view')] as const,
    request: { query: dailySummaryQuery },
    responses: okJson(dailySummaryDtoSchema, 'Daily cashier summary'),
  });

  app.openapi(dailySummaryRoute, async (c) => {
    const { branchId, date } = c.req.valid('query');
    const dateStr = date ?? new Date().toISOString().slice(0, 10);
    const result = await service.dailySummary(c, branchId, dateStr);
    return c.json(ok(result), 200);
  });

  // ─── GET /plan-balance/{planId} — plan balansi (sof o'qish) ───────────────

  const planBalanceRoute = createRoute({
    method: 'get',
    path: '/plan-balance/{planId}',
    tags: ['cashier'],
    operationId: 'getCashierPlanBalance',
    middleware: [requirePermission('cashier.view')] as const,
    request: { params: planIdParamSchema },
    responses: okJson(planBalanceDtoSchema, 'Treatment plan balance'),
  });

  app.openapi(planBalanceRoute, async (c) => {
    const { planId } = c.req.valid('param');
    const result = await service.planBalance(c, planId);
    return c.json(ok(result), 200);
  });

  // ─── GET /patient-plans — bemor rejalari (plan-billing selektori, CLI-155) ─

  const patientPlansRoute = createRoute({
    method: 'get',
    path: '/patient-plans',
    tags: ['cashier'],
    operationId: 'listCashierPatientPlans',
    middleware: [requirePermission('cashier.view')] as const,
    request: { query: patientPlansQuery },
    responses: okJson(z.array(cashierPatientPlanDtoSchema), 'Patient treatment plans for billing'),
  });

  app.openapi(patientPlansRoute, async (c) => {
    const { patientId } = c.req.valid('query');
    const rows = await service.listPatientPlans(c, patientId);
    return c.json(ok(rows), 200);
  });

  return app;
};
