import { sql } from 'drizzle-orm';
import { index, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { cashierTransactions } from './cashier.ts';
import { payrollRuns } from './payroll-runs.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * CLI-446 G3 (Variant A) — payroll refund reconciliation carry-forward jadvali.
 * Finalized (immutable) payroll run davriga tushgan refund uchun komissiya
 * tuzatishi shu yerda saqlanadi (finalized run'ni tahrirlab bo'lmaydi — Qaror #16
 * snapshot falsafasi). `cashier.service.ts::refund()` yozadi (faqat finalized
 * davrga tushsa); `payroll.service.ts::createRun()` qo'llanmagan
 * (`appliedToRunId IS NULL`) qatorlarni yig'ib komissiyaga qo'shadi (all-or-nothing
 * — floor tufayli to'liq singdirib bo'lmasa, HECH NARSA qo'llanmaydi, butun holda
 * keyingi runga ko'chadi); `finalizeRun()` qo'llangan qatorlarga `appliedToRunId`
 * yozadi.
 */
export const payrollAdjustments = pgTable(
  'payroll_adjustments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    doctorId: uuid('doctor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sourceTransactionId: uuid('source_transaction_id')
      .notNull()
      .references(() => cashierTransactions.id, { onDelete: 'restrict' }),
    // Manfiy komissiya-ekvivalenti tuzatish (refundAmount × asl finalized run'dagi
    // payroll_lines.commissionPercent snapshot foizi / 100).
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    // NULL = hali qo'llanmagan (kandidat). finalizeRun() to'liq singdirilsa yozadi.
    appliedToRunId: uuid('applied_to_run_id').references(() => payrollRuns.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payroll_adjustments_tenant_doctor_idx').on(t.tenantId, t.doctorId),
    index('payroll_adjustments_unapplied_idx').on(t.doctorId, t.appliedToRunId),
  ],
);

export type PayrollAdjustment = typeof payrollAdjustments.$inferSelect;
