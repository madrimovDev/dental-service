import type { NotificationChannel } from './types.ts';

/**
 * NoOp SMS kanal — log qiladi, yubormaydi (dev / Eskiz config yo'q).
 * P9: `ok:false` — yuborilmagan xabar hech qachon "yuborildi" deb hisoblanmasin.
 */
export const createNoOpChannel = (
  log: (msg: string) => void = console.log,
): NotificationChannel => ({
  async send(to, message) {
    log(`[NoOpSms] → ${to}: ${message.text}`);
    return { ok: false, error: 'not_configured' };
  },
});
