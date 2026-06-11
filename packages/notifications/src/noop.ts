import type { NotificationChannel } from './types.ts';

/** NoOp SMS kanal — log qiladi, yubormaydi (dev / Eskiz config yo'q). */
export const createNoOpChannel = (
  log: (msg: string) => void = console.log,
): NotificationChannel => ({
  async send(to, message) {
    log(`[NoOpSms] → ${to}: ${message.text}`);
    return { ok: true, providerId: undefined };
  },
});
