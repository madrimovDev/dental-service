import type { NotificationChannel, NotificationMessage, SendResult } from './types.ts';

/**
 * Telegram bildirishnoma kanali (V3-2) — Bot API `sendMessage`.
 * `to` = Telegram `chat_id` (bemorning `telegram_user_id`'si).
 *
 * ⚠️ TASHQI BOG'LIQLIK: jonli ishlashi uchun BotFather'dan `TELEGRAM_BOT_TOKEN`
 * kerak (foydalanuvchi taqdim etadi). Token yo'q bo'lsa factory NoOp qaytaradi.
 * Xato'da throw EMAS — `{ok:false}` (notification oqimi bloklanmaydi).
 */
/** FX-82: tashqi HTTP muddati — osilgan provayder tx'ni cheksiz ushlab turmasin. */
export const DEFAULT_CHANNEL_TIMEOUT_MS = 10_000;

export const createTelegramChannel = (config: {
  botToken: string;
  timeoutMs?: number;
}): NotificationChannel => ({
  async send(to: string, message: NotificationMessage): Promise<SendResult> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_CHANNEL_TIMEOUT_MS),
        body: JSON.stringify({
          chat_id: to,
          text: message.text,
          ...(message.buttons && message.buttons.length > 0
            ? {
                reply_markup: {
                  inline_keyboard: message.buttons.map((row) =>
                    row.map((b) => ({ text: b.text, callback_data: b.data })),
                  ),
                },
              }
            : {}),
        }),
      });
      if (!res.ok) return { ok: false, error: `http_${res.status}` };
      const data = (await res.json()) as { result?: { message_id?: number } };
      return { ok: true, providerId: data.result?.message_id?.toString() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
    }
  },
});
