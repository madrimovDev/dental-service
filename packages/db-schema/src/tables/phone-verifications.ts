import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';
import { users } from './users.ts';

/**
 * FU-15 — telefonni Telegram orqali tasdiqlash tokenlari.
 *
 * ⚠️ PLATFORM-LEVEL (RLS YO'Q, `users` kabi): tasdiq foydalanuvchiga tegishli,
 * klinikaga emas. `tenant_id` faqat QAYSI klinika botida tasdiqlanishini bildiradi
 * (taklif qilgan klinika boti) — tenant ma'lumoti emas. `check-rls-coverage`
 * istisnolar ro'yxatida.
 *
 * Oqim: `POST /auth/phone-verification/start` → token (faqat SHA-256 saqlanadi) →
 * `t.me/<bot>?start=pv_<token>` → bot `/start` da `telegram_chat_id` bog'laydi →
 * o'z kontakti (`contact.user_id === from.id`) + telefon mos → `users.phone_verified_at`.
 */
export const phoneVerifications = pgTable(
  'phone_verifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    /** `/start pv_<token>` yuborgan chat — kontakt faqat shu chat'dan qabul qilinadi. */
    telegramChatId: text('telegram_chat_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('phone_verifications_user_idx').on(t.userId),
    index('phone_verifications_chat_idx').on(t.tenantId, t.telegramChatId),
  ],
);

export type PhoneVerification = typeof phoneVerifications.$inferSelect;
