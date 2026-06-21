import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.ts';

/**
 * Password reset tokens — single-use, time-limited, USER-bound.
 * M1 da Mock OTP — backend logs OTP'ni console'ga + bu jadvalda token saqlaydi.
 * M3+ (CLI-226): kod NotificationChannel (Eskiz/NoOp) orqali yuboriladi.
 *
 * ⚠️ CLI-226 ATO fix: token endi userId bo'yicha qidiriladi (faqat tokenHash EMAS) —
 * 6-xonali kod global hash bo'yicha brute-force qilinmasligi uchun. Kod hash'i app
 * kodida solishtiriladi; noto'g'ri urinish `attempts` ni oshiradi va limit oshganda
 * token bekor qilinadi (usedAt o'rnatiladi). Shu sababli `tokenHash` UNIQUE EMAS —
 * binding userId orqali, va ikki bir vaqtdagi reset hash to'qnashuvi insert'da
 * crash qilmasligi kerak.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** Noto'g'ri kod urinishlari soni (CLI-226 brute-force limiti). */
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('password_reset_tokens_user_id_idx').on(t.userId)],
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type PasswordResetTokenInsert = typeof passwordResetTokens.$inferInsert;
