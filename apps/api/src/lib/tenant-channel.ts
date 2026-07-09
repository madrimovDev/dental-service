import {
  createEskizChannel,
  createNoOpChannel,
  createTelegramChannel,
  type NotificationChannel,
} from '@dental/notifications';
import { decryptSecret } from './crypto.ts';

/**
 * Per-tenant kanal tanlovi natijasi. `source` — worker'lar unconfigured
 * ('none') holatda test/legacy fallback (`deps.sms`) qo'llash-qo'llamaslikni
 * shu maydon orqali aniqlaydi (`resolveTenantChannel`ning o'zi hech qanday
 * fallback bilmaydi — sof funksiya).
 */
export type ResolvedTenantChannel = {
  channel: NotificationChannel;
  to: string | null;
  source: 'telegram' | 'sms' | 'none';
};

/**
 * Recall/reminder worker'lar uchun per-tenant bildirishnoma kanali (CLI-379/400):
 * Telegram(chat_id) > Eskiz SMS(phone) > NoOp. `settings` —
 * `tenant_settings.integration_settings` JSONB (`telegram.botTokenEnc`,
 * `sms.{eskizEmailEnc,eskizPasswordEnc}` — CLI-379/400 encrypt-on-write).
 */
export const resolveTenantChannel = (
  settings: Record<string, unknown> | null,
  telegramChatId: string | null,
  patientPhone: string | null,
): ResolvedTenantChannel => {
  const tg = (settings?.telegram ?? null) as { botTokenEnc?: string } | null;
  const sms = (settings?.sms ?? null) as {
    eskizEmailEnc?: string;
    eskizPasswordEnc?: string;
  } | null;

  if (telegramChatId && tg?.botTokenEnc) {
    return {
      channel: createTelegramChannel({ botToken: decryptSecret(tg.botTokenEnc) }),
      to: telegramChatId,
      source: 'telegram',
    };
  }
  if (patientPhone && sms?.eskizEmailEnc && sms?.eskizPasswordEnc) {
    return {
      channel: createEskizChannel({
        email: decryptSecret(sms.eskizEmailEnc),
        password: decryptSecret(sms.eskizPasswordEnc),
      }),
      to: patientPhone,
      source: 'sms',
    };
  }
  return { channel: createNoOpChannel(), to: patientPhone, source: 'none' };
};
