import type { NotificationChannel, NotificationMessage, SendResult } from './types.ts';

/**
 * Telegram bildirishnoma kanali (V3-2) — Bot API `sendMessage`.
 * `to` = Telegram `chat_id` (bemorning `telegram_user_id`'si).
 *
 * ⚠️ TASHQI BOG'LIQLIK: jonli ishlashi uchun BotFather'dan `TELEGRAM_BOT_TOKEN`
 * kerak (foydalanuvchi taqdim etadi). Token yo'q bo'lsa factory NoOp qaytaradi.
 * Xato'da throw EMAS — `{ok:false}` (notification oqimi bloklanmaydi).
 */
export const createTelegramChannel = (config: { botToken: string }): NotificationChannel => ({
  async send(to: string, message: NotificationMessage): Promise<SendResult> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: to, text: message.text }),
      });
      if (!res.ok) return { ok: false, error: `http_${res.status}` };
      const data = (await res.json()) as { result?: { message_id?: number } };
      return { ok: true, providerId: data.result?.message_id?.toString() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
    }
  },
});
