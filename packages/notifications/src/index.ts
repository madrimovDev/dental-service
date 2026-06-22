// @dental/notifications — abstract NotificationChannel (SMS Eskiz/NoOp + Telegram).

export { createEskizChannel } from './eskiz.ts';
export { createNoOpChannel } from './noop.ts';
export { createTelegramChannel } from './telegram.ts';
export * from './types.ts';

import { createEskizChannel } from './eskiz.ts';
import { createNoOpChannel } from './noop.ts';
import { createTelegramChannel } from './telegram.ts';
import type { NotificationChannel } from './types.ts';

/** SMS kanal factory — Eskiz config bo'lsa real, aks holda NoOp. */
export const createSmsChannel = (env: {
  eskizEmail?: string;
  eskizPassword?: string;
}): NotificationChannel =>
  env.eskizEmail && env.eskizPassword
    ? createEskizChannel({ email: env.eskizEmail, password: env.eskizPassword })
    : createNoOpChannel();

/**
 * Birlamchi bildirishnoma kanali — PRIORITET Telegram > SMS (V3-2, audit talab).
 * TELEGRAM_BOT_TOKEN bo'lsa Telegram; aks holda SMS (Eskiz/NoOp). Chaqiruvchi
 * tanlangan kanalga mos `to` beradi (Telegram chat_id afzal, fallback telefon).
 */
export const createNotificationChannel = (env: {
  telegramBotToken?: string;
  eskizEmail?: string;
  eskizPassword?: string;
}): NotificationChannel =>
  env.telegramBotToken
    ? createTelegramChannel({ botToken: env.telegramBotToken })
    : createSmsChannel(env);
