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
 * Integratsiya konfiguratsiyasi — provider bo'yicha. FAQAT sezgir bo'lmagan
 * config qaytariladi (`enabled` + non-secret label); maxfiy token/kalit hech
 * qachon response'da qaytarilmaydi (DS scaffold chegarasi — jonli faollashtirish
 * Faza 3'da foydalanuvchi sirlari bilan).
 */
const telegramConfigObject = z.object({
  enabled: z.boolean(),
  botUsername: z.string().nullable(),
});
const eskizConfigObject = z.object({
  enabled: z.boolean(),
  sender: z.string().nullable(),
});
const integrationSettingsObject = z.object({
  telegram: telegramConfigObject,
  eskiz: eskizConfigObject,
});

export type IntegrationSettingsDto = z.infer<typeof integrationSettingsObject>;

export const INTEGRATION_DEFAULTS: IntegrationSettingsDto = {
  telegram: { enabled: false, botUsername: null },
  eskiz: { enabled: false, sender: null },
};

export const integrationSettingsDtoSchema =
  integrationSettingsObject.openapi('IntegrationSettings');

/** PATCH — provider va provider ichidagi maydonlar ixtiyoriy (2-darajali qisman). */
export const updateIntegrationSettingsSchema = z.object({
  telegram: telegramConfigObject.partial().optional(),
  eskiz: eskizConfigObject.partial().optional(),
});
export type UpdateIntegrationSettingsInput = z.infer<typeof updateIntegrationSettingsSchema>;

/**
 * Tenant settings update DTO — barcha maydonlar optional (partial update).
 *
 * - `vertical` — klinika vertikali (masalan 'dental', 'cosmetology').
 * - `reminderLeadHours` — vizitdan necha soat oldin eslatma (0–168, ya'ni 0..7 kun).
 * - `currency` — valyuta kodi (masalan 'UZS').
 * - `notificationSettings` / `integrationSettings` — DS10 bo'limlari (merge update).
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
  integrationSettings: updateIntegrationSettingsSchema.optional(),
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
