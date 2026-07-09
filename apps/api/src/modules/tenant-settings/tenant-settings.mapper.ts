import type { TenantSettings } from '@dental/db-schema';
import {
  INTEGRATION_DEFAULTS,
  type IntegrationSettingsDto,
  NOTIFICATION_DEFAULTS,
  type NotificationSettingsDto,
  type TenantSettingsDto,
  type UpdateIntegrationSettingsInput,
  type UpdateNotificationSettingsInput,
} from './tenant-settings.schema.ts';

/**
 * Saqlangan (nullable, qisman) bildirishnoma JSONB ustiga default'larni qo'yib
 * to'liq DTO hosil qiladi. Faqat ma'lum kalitlar olinadi (notanish kalit tashlanadi).
 */
export const toNotificationSettingsDto = (
  stored: Record<string, boolean> | null | undefined,
): NotificationSettingsDto => {
  const s = stored ?? {};
  return {
    appointmentReminder: s.appointmentReminder ?? NOTIFICATION_DEFAULTS.appointmentReminder,
    recallSms: s.recallSms ?? NOTIFICATION_DEFAULTS.recallSms,
    paymentReceipt: s.paymentReceipt ?? NOTIFICATION_DEFAULTS.paymentReceipt,
  };
};

/** Saqlangan integration JSONB ustiga default'lar — provider bo'yicha to'liq DTO. */
export const toIntegrationSettingsDto = (
  stored: Record<string, unknown> | null | undefined,
): IntegrationSettingsDto => {
  const s = (stored ?? {}) as Partial<IntegrationSettingsDto>;
  return {
    telegram: {
      enabled: s.telegram?.enabled ?? INTEGRATION_DEFAULTS.telegram.enabled,
      botUsername: s.telegram?.botUsername ?? INTEGRATION_DEFAULTS.telegram.botUsername,
    },
    eskiz: {
      enabled: s.eskiz?.enabled ?? INTEGRATION_DEFAULTS.eskiz.enabled,
      sender: s.eskiz?.sender ?? INTEGRATION_DEFAULTS.eskiz.sender,
    },
  };
};

/**
 * PATCH merge — saqlangan bildirishnoma qiymati ustiga qisman patch'ni qo'yadi.
 * Saqlash uchun TO'LIQ kanonik obyekt qaytaradi (default'lar bilan to'ldirilgan),
 * shuning uchun blob hech qachon qisman saqlanmaydi.
 */
export const mergeNotificationSettings = (
  stored: Record<string, boolean> | null | undefined,
  patch: UpdateNotificationSettingsInput,
): NotificationSettingsDto => {
  const current = toNotificationSettingsDto(stored);
  return {
    appointmentReminder: patch.appointmentReminder ?? current.appointmentReminder,
    recallSms: patch.recallSms ?? current.recallSms,
    paymentReceipt: patch.paymentReceipt ?? current.paymentReceipt,
  };
};

/**
 * PATCH merge — 2-darajali: faqat berilgan provider va uning berilgan maydonlari
 * yangilanadi; qolgan provider config (masalan `telegram.botUsername`) saqlanadi.
 * `null` aniq berilsa saqlanadi (`!== undefined` tekshiruvi).
 */
export const mergeIntegrationSettings = (
  stored: Record<string, unknown> | null | undefined,
  patch: UpdateIntegrationSettingsInput,
): IntegrationSettingsDto => {
  const current = toIntegrationSettingsDto(stored);
  return {
    telegram: {
      enabled: patch.telegram?.enabled ?? current.telegram.enabled,
      botUsername:
        patch.telegram?.botUsername !== undefined
          ? patch.telegram.botUsername
          : current.telegram.botUsername,
    },
    eskiz: {
      enabled: patch.eskiz?.enabled ?? current.eskiz.enabled,
      sender: patch.eskiz?.sender !== undefined ? patch.eskiz.sender : current.eskiz.sender,
    },
  };
};

/** DB row (Date timestamp) → wire DTO (ISO string). Envelope type-check uchun zarur. */
export const toTenantSettingsDto = (row: TenantSettings): TenantSettingsDto => ({
  id: row.id,
  tenantId: row.tenantId,
  vertical: row.vertical,
  reminderLeadHours: row.reminderLeadHours,
  currency: row.currency,
  onboardingDismissedAt: row.onboardingDismissedAt ? row.onboardingDismissedAt.toISOString() : null,
  maxDiscountPercent: row.maxDiscountPercent,
  noShowStrikeThreshold: row.noShowStrikeThreshold,
  notificationSettings: toNotificationSettingsDto(row.notificationSettings),
  integrationSettings: toIntegrationSettingsDto(row.integrationSettings),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
