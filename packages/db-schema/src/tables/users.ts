import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Platform-level user identity.
 * ⚠️ NO `tenant_id` — users span tenants via `user_assignments`.
 * `email` va `phone` platform-wide UNIQUE.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    email: text('email').notNull().unique(),
    phone: text('phone').unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name'),
    preferredLanguage: text('preferred_language').notNull().default('uz'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('users_email_idx').on(t.email), index('users_phone_idx').on(t.phone)],
);

export type User = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
