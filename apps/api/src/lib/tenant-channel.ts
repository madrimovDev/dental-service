import {
  createEskizChannel,
  createNoOpChannel,
  createTelegramChannel,
  type NotificationChannel,
  type NotificationMessage,
  type SendResult,
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
  /**
   * FX-41 (LA-22): Telegram tanlanganda va SMS ham sozlangan + telefon bor bo'lsa —
   * Telegram yuborilmasa ishlatiladigan zaxira (Eskiz SMS).
   */
  fallback?: { channel: NotificationChannel; to: string } | null;
};

/** Telegram bot bloklangan / chat yopilgan (Bot API 403) — chat bog'lanishi eskirgan. */
export const isTelegramBlocked = (res: SendResult): boolean => !res.ok && res.error === 'http_403';

export type SendWithFallbackResult = {
  res: SendResult;
  /** Natija zaxira (SMS) kanalidan. */
  usedFallback: boolean;
  /** Birlamchi Telegram 403 qaytardi — chat_id tozalanishi kerak. */
  blocked: boolean;
};

/**
 * FX-41: birlamchi kanal bilan yuboradi; Telegram `ok:false` bo'lsa — zaxira SMS'ga o'tadi.
 * 403 (bloklangan) da `onBlocked` chaqiriladi (chaqiruvchi chat_id'ni tozalaydi). Hech
 * qachon throw qilmaydi (`onBlocked` xatosi yutiladi).
 */
export async function sendWithFallback(
  resolved: {
    channel: NotificationChannel;
    to: string;
    fallback?: ResolvedTenantChannel['fallback'];
  },
  message: NotificationMessage,
  onBlocked?: () => Promise<void>,
): Promise<SendWithFallbackResult> {
  const res = await resolved.channel.send(resolved.to, message);
  if (res.ok) return { res, usedFallback: false, blocked: false };
  const blocked = isTelegramBlocked(res);
  if (blocked && onBlocked) {
    try {
      await onBlocked();
    } catch {
      /* best-effort */
    }
  }
  if (resolved.fallback) {
    const fb = await resolved.fallback.channel.send(resolved.fallback.to, { text: message.text });
    return { res: fb, usedFallback: true, blocked };
  }
  return { res, usedFallback: false, blocked };
}

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

  const smsChannel = (): NotificationChannel | null =>
    sms?.eskizEmailEnc && sms?.eskizPasswordEnc
      ? createEskizChannel({
          email: decryptSecret(sms.eskizEmailEnc),
          password: decryptSecret(sms.eskizPasswordEnc),
        })
      : null;

  if (telegramChatId && tg?.botTokenEnc) {
    const telegram = createTelegramChannel({ botToken: decryptSecret(tg.botTokenEnc) });
    // FX-41: zaxira SMS — buzuq SMS kredensiali Telegram yo'lini buzmasin (lazy, try/catch).
    let fallback: ResolvedTenantChannel['fallback'] = null;
    if (patientPhone) {
      try {
        const ch = smsChannel();
        if (ch) fallback = { channel: ch, to: patientPhone };
      } catch {
        fallback = null;
      }
    }
    return { channel: telegram, to: telegramChatId, source: 'telegram', fallback };
  }
  if (patientPhone) {
    const ch = smsChannel();
    if (ch) return { channel: ch, to: patientPhone, source: 'sms' };
  }
  return { channel: createNoOpChannel(), to: patientPhone, source: 'none' };
};
