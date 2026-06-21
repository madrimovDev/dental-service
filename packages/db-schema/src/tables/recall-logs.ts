import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { recalls } from './recalls.ts';
import { tenants } from './tenants.ts';

/** SMS yetkazish natijasi (RFC-0011 §3). */
export const recallLogOutcomeEnum = pgEnum('recall_log_outcome', ['sent', 'failed', 'no_phone']);

/** Yuborish kanali. */
export const recallLogChannelEnum = pgEnum('recall_log_channel', ['sms', 'manual']);

/**
 * Recall logs — recall bo'yicha SMS yetkazish audit izi (RFC-0011 §3).
 * Bitta recall bir necha urinishga ega bo'lishi mumkin → har biri alohida row.
 */
export const recallLogs = pgTable(
  'recall_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    recallId: uuid('recall_id')
      .notNull()
      .references(() => recalls.id, { onDelete: 'cascade' }),
    channel: recallLogChannelEnum('channel').notNull().default('sms'),
    outcome: recallLogOutcomeEnum('outcome').notNull(),
    detail: text('detail'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('recall_logs_recall_idx').on(t.recallId)],
);

export type RecallLog = typeof recallLogs.$inferSelect;
export type RecallLogInsert = typeof recallLogs.$inferInsert;
