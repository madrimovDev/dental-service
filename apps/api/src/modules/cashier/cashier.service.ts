import { randomBytes } from 'node:crypto';
import {
  cashierTransactionItems,
  cashierTransactions,
  treatmentStagePayments,
  treatmentStages,
} from '@dental/db-schema';
import { and, between, count, desc, eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import { computePlanBalance } from './cashier.billing.ts';
import type { CreateTransactionInput, ListTransactionsQuery } from './cashier.schema.ts';

/**
 * Soliq Fiscal Provider — scaffold pattern.
 * M1-M3 da NoOp (DB ga yozadi, soliqqa yubormaydi).
 * Phase 2 da real SoliqApiProvider plug qilinadi — business kod o'zgarmaydi.
 */
interface FiscalProvider {
  createReceipt(payment: { id: string; amount: number; items: unknown[] }): Promise<{
    fiscalId: string | null;
    response: unknown;
  }>;
}

const noOpFiscalProvider: FiscalProvider = {
  async createReceipt() {
    // M1-M3: hech narsa yubormaymiz. Receipt raqami DB ichida generate qilinadi.
    return { fiscalId: null, response: { provider: 'noop', note: 'No fiscal device wired' } };
  },
};

const generateReceiptNumber = (): string => {
  const date = new Date();
  const yyyymmdd = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
  const rnd = randomBytes(2).toString('hex').toUpperCase();
  return `R-${yyyymmdd}-${rnd}`;
};

/** Allocation yig'indisi paidAmount'dan oshganda — routes 400 ga aylantiradi. */
export class AllocationExceedError extends Error {
  constructor() {
    super('Allocation sum exceeds paid amount');
    this.name = 'AllocationExceedError';
  }
}

export const createCashierService = (deps: { audit: AuditLogger }) => {
  const fiscal: FiscalProvider = noOpFiscalProvider;

  async function list(c: Context, query: ListTransactionsQuery) {
    const db = getDb(c);
    const offset = (query.page - 1) * query.pageSize;

    const filters = [];
    if (query.branchId) filters.push(eq(cashierTransactions.branchId, query.branchId));
    if (query.patientId) filters.push(eq(cashierTransactions.patientId, query.patientId));
    if (query.from && query.to) {
      filters.push(
        between(cashierTransactions.createdAt, new Date(query.from), new Date(query.to)),
      );
    }

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(cashierTransactions)
        .where(where)
        .orderBy(desc(cashierTransactions.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      db.select({ total: count() }).from(cashierTransactions).where(where),
    ]);

    const total = totalRows[0]?.total ?? 0;
    return { data: rows, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async function getById(c: Context, id: string) {
    const db = getDb(c);
    const [tx] = await db.select().from(cashierTransactions).where(eq(cashierTransactions.id, id));
    if (!tx) return null;

    const items = await db
      .select()
      .from(cashierTransactionItems)
      .where(eq(cashierTransactionItems.transactionId, id));

    return { ...tx, items };
  }

  async function create(c: Context, input: CreateTransactionInput) {
    const db = getDb(c);
    const tenantId = c.get('activeTenantId');
    const user = c.get('user');
    if (!tenantId) throw new Error('No tenant context');

    const totalAmount = input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    const netTotal = totalAmount - input.discount;

    // Allocation yig'indisi paidAmount'dan oshmasligi shart (qisman ruxsat, oshib ketish RAD).
    if (input.allocations && input.allocations.length > 0) {
      const allocSum = input.allocations.reduce((s, a) => s + a.amount, 0);
      if (allocSum > input.paidAmount) {
        throw new AllocationExceedError();
      }
    }

    const receiptNumber = generateReceiptNumber();

    return await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);

      const [transaction] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId,
          branchId: input.branchId,
          patientId: input.patientId ?? null,
          treatmentPlanId: input.treatmentPlanId ?? null,
          receiptNumber,
          totalAmount: String(netTotal),
          paidAmount: String(input.paidAmount),
          discount: String(input.discount),
          paymentMethod: input.paymentMethod,
          notes: input.notes ?? null,
          createdBy: user?.id ?? null,
        })
        .returning();

      if (!transaction) throw new Error('Transaction insert failed');

      // Items
      const items = await tx
        .insert(cashierTransactionItems)
        .values(
          input.items.map((i) => ({
            transactionId: transaction.id,
            serviceId: i.serviceId,
            serviceName: i.serviceName,
            quantity: i.quantity,
            unitPrice: String(i.unitPrice),
            subtotal: String(i.unitPrice * i.quantity),
          })),
        )
        .returning();

      // Per-bosqich allocation rowlar (ijobiy = to'lov). Bir tx ichida (RLS tx-bound).
      if (input.allocations && input.allocations.length > 0) {
        await tx.insert(treatmentStagePayments).values(
          input.allocations.map((a) => ({
            tenantId,
            transactionId: transaction.id,
            stageId: a.stageId,
            amount: String(a.amount),
          })),
        );
      }

      // Fiscal (NoOp — M3 da)
      const fiscalResult = await fiscal.createReceipt({
        id: transaction.id,
        amount: Number(transaction.totalAmount),
        items: items,
      });

      if (fiscalResult.fiscalId || fiscalResult.response) {
        await tx
          .update(cashierTransactions)
          .set({
            fiscalReceiptId: fiscalResult.fiscalId,
            fiscalResponse: fiscalResult.response as object,
          })
          .where(eq(cashierTransactions.id, transaction.id));
      }

      await deps.audit.record(c, {
        action: 'created',
        resourceType: 'cashier_transaction',
        resourceId: transaction.id,
        after: { receiptNumber, totalAmount: netTotal, items: input.items.length },
      });

      return { ...transaction, items };
    });
  }

  async function refund(c: Context, id: string) {
    const db = getDb(c);
    const [original] = await db
      .select()
      .from(cashierTransactions)
      .where(eq(cashierTransactions.id, id));
    if (!original) return null;
    if (original.type === 'refund') return null; // refund of refund — not allowed

    return await db.transaction(async (tx) => {
      const [refundTx] = await tx
        .insert(cashierTransactions)
        .values({
          tenantId: original.tenantId,
          branchId: original.branchId,
          patientId: original.patientId,
          receiptNumber: `${original.receiptNumber}-R`,
          totalAmount: original.totalAmount,
          paidAmount: original.paidAmount,
          discount: original.discount,
          paymentMethod: original.paymentMethod,
          type: 'refund',
          parentTransactionId: id,
          status: 'completed',
          notes: `Refund of ${original.receiptNumber}`,
          createdBy: c.get('user')?.id ?? null,
        })
        .returning();

      // Asl tranzaksiya allocation'larini negatsiya qilish (balansni tiklaydi).
      const origAllocations = await tx
        .select({ stageId: treatmentStagePayments.stageId, amount: treatmentStagePayments.amount })
        .from(treatmentStagePayments)
        .where(eq(treatmentStagePayments.transactionId, id));

      if (refundTx && origAllocations.length > 0) {
        await tx.insert(treatmentStagePayments).values(
          origAllocations.map((a) => ({
            tenantId: original.tenantId,
            transactionId: refundTx.id,
            stageId: a.stageId,
            amount: String(-Number(a.amount)),
          })),
        );
      }

      await tx
        .update(cashierTransactions)
        .set({ status: 'voided' })
        .where(eq(cashierTransactions.id, id));

      await deps.audit.record(c, {
        action: 'refunded',
        resourceType: 'cashier_transaction',
        resourceId: id,
        before: original,
        after: refundTx,
      });

      return refundTx;
    });
  }

  /** Daily summary for cashier close */
  async function dailySummary(c: Context, branchId: string, dateStr: string) {
    const db = getDb(c);
    const start = new Date(`${dateStr}T00:00:00Z`);
    const end = new Date(`${dateStr}T23:59:59Z`);

    const rows = await db
      .select({
        paymentMethod: cashierTransactions.paymentMethod,
        type: cashierTransactions.type,
        total: sql<string>`SUM(${cashierTransactions.totalAmount})`,
        count: count(),
      })
      .from(cashierTransactions)
      .where(
        and(
          eq(cashierTransactions.branchId, branchId),
          between(cashierTransactions.createdAt, start, end),
          eq(cashierTransactions.status, 'completed'),
        ),
      )
      .groupBy(cashierTransactions.paymentMethod, cashierTransactions.type);

    return { date: dateStr, branchId, breakdown: rows };
  }

  /** Plan balansi — sof o'qish (treatment_stages + allocation yig'indilari). Saqlanmaydi. */
  async function planBalance(c: Context, planId: string) {
    const db = getDb(c);

    // Plan bosqichlari (RLS tenant orqali filtrlaydi — explicit WHERE tenant_id YOZILMAYDI).
    const stageRows = await db
      .select({
        id: treatmentStages.id,
        serviceName: treatmentStages.serviceName,
        cost: treatmentStages.cost,
      })
      .from(treatmentStages)
      .where(eq(treatmentStages.treatmentPlanId, planId));

    // Shu bosqichlarga tegishli allocation'lar.
    const allocRows = await db
      .select({
        stageId: treatmentStagePayments.stageId,
        amount: treatmentStagePayments.amount,
      })
      .from(treatmentStagePayments)
      .innerJoin(treatmentStages, eq(treatmentStagePayments.stageId, treatmentStages.id))
      .where(eq(treatmentStages.treatmentPlanId, planId));

    return computePlanBalance(stageRows, allocRows);
  }

  return { list, getById, create, refund, dailySummary, planBalance };
};

export type CashierService = ReturnType<typeof createCashierService>;
