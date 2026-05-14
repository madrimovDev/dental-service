import { sql } from 'drizzle-orm';
import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Placeholder table — M0 da end-to-end DB connection'ni tekshirish uchun.
 * M1 boshlanganda olib tashlanadi.
 */
export const healthCheck = pgTable('_health_check', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

export type HealthCheck = typeof healthCheck.$inferSelect;
export type HealthCheckInsert = typeof healthCheck.$inferInsert;
