import { sql } from 'drizzle-orm';
import { type AnyPgColumn, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { branches } from './branches.ts';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * Refresh token rotation jadvali.
 *
 * Har `/auth/refresh` chaqirilganda:
 *  - Eski token `revoked_at` qo'yiladi
 *  - Yangi token yaratiladi, `replaced_by_id` orqali bog'lanadi
 *  - Agar revoked token qayta ishlatilsa (replay) → butun chain revoke qilinadi
 *
 * Workspace context (active_tenant_id, active_branch_id):
 *  - Har refresh row foydalanuvchining shu chain'dagi joriy workspace'ini saqlaydi
 *  - Login da null (workspace tanlanmagan)
 *  - Switch-workspace da yangilanadi (eski rotated → yangida atid/abid yoziladi)
 *  - Refresh da o'qib, JWT'ga atid/abid/perms beriladi
 *  - Multi-device toza: telefon tenant A, noutbuk tenant B — har birining refresh chain'i alohida
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    replacedById: uuid('replaced_by_id').references((): AnyPgColumn => refreshTokens.id, {
      onDelete: 'cascade',
    }),

    // Workspace context — shu refresh chain'ning joriy holati
    activeTenantId: uuid('active_tenant_id').references(() => tenants.id, {
      onDelete: 'cascade',
    }),
    activeBranchId: uuid('active_branch_id').references(() => branches.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('refresh_tokens_user_idx').on(t.userId),
    index('refresh_tokens_expires_idx').on(t.expiresAt),
    index('refresh_tokens_replaced_by_idx').on(t.replacedById),
  ],
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type RefreshTokenInsert = typeof refreshTokens.$inferInsert;
