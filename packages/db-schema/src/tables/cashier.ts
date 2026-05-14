import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { patients } from './patients.ts';
import { services } from './services.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'card', 'transfer', 'other']);
export const transactionTypeEnum = pgEnum('transaction_type', ['payment', 'refund', 'void']);
export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'completed',
  'voided',
]);

/**
 * Cashier transactions — to'lov qaydlari.
 * Soliq.uz scaffold — M6'da real fiscal integration. Hozir `noop` provider.
 */
export const cashierTransactions = pgTable(
  'cashier_transactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'cascade' }),
    patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'set null' }),

    receiptNumber: text('receipt_number'),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
    paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }).notNull(),
    discount: numeric('discount', { precision: 14, scale: 2 }).notNull().default('0'),
    currency: text('currency').notNull().default('UZS'),

    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    type: transactionTypeEnum('type').notNull().default('payment'),
    parentTransactionId: uuid('parent_transaction_id'),

    status: transactionStatusEnum('status').notNull().default('completed'),
    notes: text('notes'),

    fiscalProvider: text('fiscal_provider').notNull().default('noop'),
    fiscalReceiptId: text('fiscal_receipt_id'),
    fiscalResponse: jsonb('fiscal_response'),

    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cashier_tx_tenant_branch_idx').on(t.tenantId, t.branchId, t.createdAt),
    index('cashier_tx_patient_idx').on(t.patientId),
    index('cashier_tx_status_idx').on(t.status),
  ],
);

export type CashierTransaction = typeof cashierTransactions.$inferSelect;
export type CashierTransactionInsert = typeof cashierTransactions.$inferInsert;

/**
 * Transaction items — har to'lovdagi xizmatlar.
 */
export const cashierTransactionItems = pgTable(
  'cashier_transaction_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => cashierTransactions.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    serviceName: text('service_name').notNull(), // snapshot — xizmat o'chirilsa ham saqlanadi
    quantity: integer('quantity').notNull().default(1),
    unitPrice: numeric('unit_price', { precision: 14, scale: 2 }).notNull(),
    subtotal: numeric('subtotal', { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [index('cashier_items_tx_idx').on(t.transactionId)],
);

export type CashierTransactionItem = typeof cashierTransactionItems.$inferSelect;
export type CashierTransactionItemInsert = typeof cashierTransactionItems.$inferInsert;
