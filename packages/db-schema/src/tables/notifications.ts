import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * Notifications — in-app bildirishnoma feed (topbar bell).
 * Tenant-scoped + user-scoped. Yozilish eslatmasi (reminder worker), tizim xabarlari.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    /** FX-167: web t() bilan render qilishi uchun tuzilgan parametrlar (matn fallback title/body'da). */
    params: jsonb('params').$type<Record<string, string | number>>(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_tenant_user_idx').on(t.tenantId, t.userId, t.createdAt)],
);

export type Notification = typeof notifications.$inferSelect;
