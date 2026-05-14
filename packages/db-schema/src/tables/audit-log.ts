import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * Audit log — har permission-protected mutation **sync in transaction** yoziladi.
 * Sensitive read'lar (medical_record.view) ham yoziladi (tarkibi yo'q, faqat ko'rilgani).
 *
 * `tenant_id` NULLABLE — platform-level event'lar uchun (login, password reset, ...).
 *
 * Retention: 1 yil (Phase 2 da arxivga ko'chiriladi).
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }), // NULL = platform event
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // 'created', 'updated', 'deleted', 'viewed', 'login', 'workspace_switched'
    resourceType: text('resource_type').notNull(), // 'patient', 'appointment', 'auth', ...
    resourceId: uuid('resource_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_tenant_resource_idx').on(t.tenantId, t.resourceType, t.createdAt),
    index('audit_tenant_user_idx').on(t.tenantId, t.userId, t.createdAt),
  ],
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type AuditLogInsert = typeof auditLog.$inferInsert;
