import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.ts';

/**
 * Tenant settings — har tenant uchun bitta sozlamalar row (get-or-create).
 *
 * - `vertical` — klinika vertikali (default 'dental'; kelajakda kosmetologiya va boshqalar).
 * - `reminderLeadHours` — eslatma vaqti (vizitdan necha soat oldin SMS).
 * - `currency` — valyuta (default 'UZS').
 *
 * R5 prerequisite + orphaned `tenant_settings.*` permission egasi.
 */
export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    vertical: text('vertical').notNull().default('dental'),
    reminderLeadHours: integer('reminder_lead_hours').notNull().default(24),
    currency: text('currency').notNull().default('UZS'),
    // CLI-444: kassa erkin POS chegirmasining maksimal foizi (0–100). Default 100 =
    // cheklovsiz (backward-compatible — itemsGross'gacha ruxsat, mavjud xulq). Faqat
    // `tenant_settings.edit` egasi (Tenant Admin/Owner) o'zgartiradi; kassir/registrator
    // limitni ko'tara olmaydi. Enforcement: cashier.service.ts::create.
    maxDiscountPercent: integer('max_discount_percent').notNull().default(100),
    onboardingDismissedAt: timestamp('onboarding_dismissed_at', { withTimezone: true }),
    // Recall subsystem (RFC-0011): default interval (oy), klinika vaqt zonasi va
    // recall SMS yuborish soati (klinika-local). Scheduler shu sozlamalarga amal qiladi.
    defaultRecallIntervalMonths: integer('default_recall_interval_months').notNull().default(6),
    timezone: text('timezone').notNull().default('Asia/Tashkent'),
    recallSendHourLocal: integer('recall_send_hour_local').notNull().default(10),
    // DS12 (DS10 Sozlamalar): bildirishnoma toggle'lari — kanal/hodisa bo'yicha
    // boolean xarita (masalan { appointmentReminder: true, recallSms: false }).
    // Nullable JSONB — eski rows'da yo'q; default xulq service qatlamida.
    notificationSettings: jsonb('notification_settings').$type<Record<string, boolean> | null>(),
    // DS12 (DS10 Sozlamalar): integratsiya konfiguratsiyasi (provider bo'yicha blob,
    // masalan { telegram: { enabled }, sms: { provider } }). Nullable, backward-compatible.
    integrationSettings: jsonb('integration_settings').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('tenant_settings_tenant_unique').on(t.tenantId)],
);

export type TenantSettings = typeof tenantSettings.$inferSelect;
export type TenantSettingsInsert = typeof tenantSettings.$inferInsert;
