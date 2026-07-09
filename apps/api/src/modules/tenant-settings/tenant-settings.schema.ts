import { z } from '@hono/zod-openapi';

/* ────────────────────────────────────────────────────────────────────────
 * DS12 (DS10 Sozlamalar) — Notifications + Integrations
 *
 * Ikkala bo'lim `tenant_settings` ning nullable JSONB ustunlarida saqlanadi
 * (`notification_settings`, `integration_settings`) — yangi jadval YO'Q, RLS
 * surface o'zgarmaydi. Saqlangan qiymat qisman bo'lishi mumkin; to'liq DTO
 * default'lar bilan to'ldiriladi (mapper). PATCH'da blob TO'LIQ almashtirilmaydi,
 * balki saqlangan qiymat ustiga MERGE qilinadi (integration 2-darajali merge).
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * Bildirishnoma toggle'lari — haqiqiy yuborilayotgan hodisalarga mos:
 * - `appointmentReminder` — vizit eslatma SMS (reminder-worker `appointment_reminder`).
 * - `recallSms` — recall SMS (recalls subsystem).
 * - `paymentReceipt` — to'lov kvitansiyasi bildirishnomasi (`payment`).
 * Sezgir emas — bool xarita.
 */
const notificationSettingsObject = z.object({
  appointmentReminder: z.boolean(),
  recallSms: z.boolean(),
  paymentReceipt: z.boolean(),
});

export type NotificationSettingsDto = z.infer<typeof notificationSettingsObject>;

/** Saqlangan qiymat yo'q/qisman bo'lganda qo'llaniladigan default toggle'lar. */
export const NOTIFICATION_DEFAULTS: NotificationSettingsDto = {
  appointmentReminder: true,
  recallSms: true,
  paymentReceipt: false,
};

export const notificationSettingsDtoSchema =
  notificationSettingsObject.openapi('NotificationSettings');

/** PATCH — har toggle ixtiyoriy (qisman update, qolganlari saqlanadi). */
export const updateNotificationSettingsSchema = notificationSettingsObject.partial();
export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsSchema>;

/**
 * Integratsiya kredensiallari — CLI-379/400: xom cred (Telegram bot token,
 * Eskiz email/parol) hech qachon response'da qaytarilmaydi. Service ularni
 * AES-256-GCM bilan shifrlab `integration_settings` JSONB'ga saqlaydi
 * (`{ telegram: { botTokenEnc, botUsername? } | null, sms: { eskizEmailEnc,
 * eskizPasswordEnc } | null }`); mapper o'qishda faqat `{ configured, hint }`
 * maskalangan holatni chiqaradi (`toIntegrationDto`, tenant-settings.mapper.ts).
 */
const integrationStatusObject = z.object({
  configured: z.boolean(),
  hint: z.string().nullable(),
});

export const integrationSettingsDtoSchema = z
  .object({
    telegram: integrationStatusObject,
    sms: integrationStatusObject,
  })
  .openapi({
    example: {
      telegram: { configured: false, hint: null },
      sms: { configured: false, hint: null },
    },
  });

export type IntegrationSettingsDto = z.infer<typeof integrationSettingsDtoSchema>;

/**
 * Tenant settings update DTO — barcha maydonlar optional (partial update).
 *
 * - `vertical` — klinika vertikali (masalan 'dental', 'cosmetology').
 * - `reminderLeadHours` — vizitdan necha soat oldin eslatma (0–168, ya'ni 0..7 kun).
 * - `currency` — valyuta kodi (masalan 'UZS').
 * - `notificationSettings` — DS10 bo'lim (merge update).
 * - `telegram` / `sms` — CLI-379/400 xom kredensiallar; service AES bilan
 *   shifrlab `integration_settings`ga saqlaydi. `null` → integration o'chiriladi.
 */
export const updateSettingsSchema = z.object({
  vertical: z.string().min(1).optional(),
  reminderLeadHours: z.number().int().min(0).max(168).optional(),
  currency: z.string().min(1).max(8).optional(),
  onboardingDismissedAt: z.iso.datetime().nullable().optional(),
  // CLI-444: kassa erkin POS chegirmasining maksimal foizi (0–100, 100 = cheklovsiz).
  maxDiscountPercent: z.number().int().min(0).max(100).optional(),
  // CLI-474 (L7): no-show strike chegarasi (0 = o'chiq).
  noShowStrikeThreshold: z.number().int().min(0).max(50).optional(),
  notificationSettings: updateNotificationSettingsSchema.optional(),
  // CLI-379/400: xom kredensiallar — service AES bilan shifrlab saqlaydi.
  // `null` → integration o'chiriladi.
  telegram: z
    .object({ botToken: z.string().min(20).max(200) })
    .nullable()
    .optional(),
  sms: z
    .object({ eskizEmail: z.email().max(160), eskizPassword: z.string().min(1).max(200) })
    .nullable()
    .optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/** Response DTO — wire shakli (timestamp'lar ISO string). `.openapi()` ref komponent. */
export const tenantSettingsDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    vertical: z.string().openapi({ example: 'dental' }),
    reminderLeadHours: z.number().int().openapi({ example: 24 }),
    currency: z.string().openapi({ example: 'UZS' }),
    onboardingDismissedAt: z.string().nullable().openapi({ example: null }),
    maxDiscountPercent: z.number().int().openapi({ example: 100 }),
    noShowStrikeThreshold: z.number().int().openapi({ example: 3 }),
    notificationSettings: notificationSettingsDtoSchema,
    integrationSettings: integrationSettingsDtoSchema,
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('TenantSettings');

export type TenantSettingsDto = z.infer<typeof tenantSettingsDtoSchema>;

/**
 * Yengil DTO — faqat tenant vertikali. Har tenant a'zosi UI gating uchun o'qishi kerak
 * (sezgir emas), shuning uchun `requirePermission` siz endpoint orqali qaytariladi (CLI-80).
 */
export const tenantVerticalDtoSchema = z
  .object({ vertical: z.string().openapi({ example: 'dental' }) })
  .openapi('TenantVertical');

export type TenantVerticalDto = z.infer<typeof tenantVerticalDtoSchema>;

/**
 * CLI-379/400 — `POST /tenant-settings/integrations/test` body. Validates
 * Telegram bot token (via `getMe`) or Eskiz email/password (via `auth/login`)
 * BEFORE saving — a pure "test these creds" action, never persisted. Mirrors
 * the shape of `updateSettingsSchema`'s `telegram`/`sms` fields but requires
 * exactly one payload matching `target` (not nullable — nothing to "clear" here).
 */
export const integrationsTestSchema = z
  .object({
    target: z.enum(['telegram', 'sms']),
    telegram: z.object({ botToken: z.string().min(20).max(200) }).optional(),
    sms: z
      .object({ eskizEmail: z.email().max(160), eskizPassword: z.string().min(1).max(200) })
      .optional(),
  })
  .openapi('IntegrationsTestInput', {
    example: { target: 'telegram', telegram: { botToken: '123456:ABC-DEF...' } },
  });

export type IntegrationsTestInput = z.infer<typeof integrationsTestSchema>;

/** `POST /tenant-settings/integrations/test` response — `detail` is human-readable (e.g. `@botusername`), `null` when N/A. */
export const integrationsTestResultSchema = z
  .object({
    ok: z.boolean(),
    detail: z.string().nullable(),
  })
  .openapi('IntegrationsTestResult', { example: { ok: true, detail: '@clinicbot' } });

export type IntegrationsTestResultDto = z.infer<typeof integrationsTestResultSchema>;
