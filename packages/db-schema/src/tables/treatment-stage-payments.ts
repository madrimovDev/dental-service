import { sql } from 'drizzle-orm';
import { index, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { cashierTransactions } from './cashier.ts';
import { tenants } from './tenants.ts';
import { treatmentStages } from './treatment-plans.ts';

/**
 * Treatment stage payments — per-bosqich to'lov allocation jadvali (billing, Kassa egaligida).
 *
 * Bitta tranzaksiya bir necha bosqichni to'lashi mumkin (har biri bir row).
 * `amount` ijobiy = to'lov; manfiy = refund negatsiyasi (asl allocation'ni bekor qiladi).
 * Plan balansi shu rowlardan computed (saqlanmaydi). `treatment_stages` o'zgartirilmaydi.
 */
export const treatmentStagePayments = pgTable(
  'treatment_stage_payments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => cashierTransactions.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => treatmentStages.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stage_payments_tenant_stage_idx').on(t.tenantId, t.stageId),
    index('stage_payments_transaction_idx').on(t.transactionId),
  ],
);

export type TreatmentStagePayment = typeof treatmentStagePayments.$inferSelect;
export type TreatmentStagePaymentInsert = typeof treatmentStagePayments.$inferInsert;
