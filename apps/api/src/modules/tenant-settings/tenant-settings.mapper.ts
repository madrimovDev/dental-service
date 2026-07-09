import type { TenantSettings } from '@dental/db-schema';
import { decryptSecret } from '../../lib/crypto.ts';
import {
  NOTIFICATION_DEFAULTS,
  type NotificationSettingsDto,
  type TenantSettingsDto,
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

/**
 * CLI-379/400: xom kredensial (`botTokenEnc`/`eskizPasswordEnc`) hech qachon
 * response'da qaytarilmaydi — faqat "configured" + oxirgi 4 belgi hint.
 * Shifr buzilgan/eskirgan bo'lsa (masalan kalit almashgan) — `configured: true`
 * lekin `hint: null` (mavjudligi ma'lum, lekin ko'rsatib bo'lmaydi).
 */
const maskEnc = (enc: string | undefined): { configured: boolean; hint: string | null } => {
  if (!enc) return { configured: false, hint: null };
  try {
    const raw = decryptSecret(enc);
    return { configured: true, hint: `••••${raw.slice(-4)}` };
  } catch {
    return { configured: true, hint: null };
  }
};

/** Saqlangan integration JSONB (xom cred) → maskalangan DTO (configured/hint). */
const toIntegrationDto = (settings: Record<string, unknown> | null) => {
  const tg = (settings?.telegram ?? null) as { botTokenEnc?: string } | null;
  const sms = (settings?.sms ?? null) as { eskizPasswordEnc?: string } | null;
  return {
    telegram: maskEnc(tg?.botTokenEnc),
    sms: maskEnc(sms?.eskizPasswordEnc),
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
  integrationSettings: toIntegrationDto(row.integrationSettings as Record<string, unknown> | null),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
