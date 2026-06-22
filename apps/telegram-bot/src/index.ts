/**
 * @dental/telegram-bot — Telegram bot (V3-2, CLI-250) — SKELETON.
 *
 * ⚠️ TASHQI BOG'LIQLIK: jonli ishlashi uchun BotFather'dan `TELEGRAM_BOT_TOKEN`
 * kerak (foydalanuvchi taqdim etadi). Token yo'q bo'lsa bot ishga tushmaydi
 * (skeleton — graceful no-op). Long-poll rejimida (webhook prod'da qo'shilishi mumkin).
 *
 * Joriy doirasi (scaffold):
 *   - `/start` — bemorga chat_id'sini ko'rsatadi (klinikaga `telegram_user_id` sifatida
 *     berish uchun — deep-link/account-bog'lash keyingi qadam).
 *   - Bildirishnoma yuborish API'dan `@dental/notifications` TelegramChannel orqali
 *     (alohida — bu app faqat KIRUVCHI bot mantig'i; chiquvchi xabarlar worker'da).
 *
 * TODO (jonli faollashtirish):
 *   - Bemor account-bog'lash oqimi (phone ↔ telegram_user_id, deep-link).
 *   - Appointment reminder inline tugma (Tasdiqlash/Ko'chirish) callback'lari.
 *   - Recall javoblari.
 *   - Webhook rejimi (prod).
 */
import { Telegraf } from 'telegraf';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.warn(
    "[telegram-bot] TELEGRAM_BOT_TOKEN o'rnatilmagan — bot ishga tushmadi (skeleton no-op).",
  );
  process.exit(0);
}

const bot = new Telegraf(token);

bot.start((ctx) =>
  ctx.reply(
    `Salom! Klinika bildirishnomalarini olish uchun ushbu ID'ni administratorga bering: ${ctx.chat.id}`,
  ),
);

bot.help((ctx) => ctx.reply('Klinika bot — appointment eslatmalari va recall uchun.'));

bot.launch().then(() => console.log('[telegram-bot] long-poll ishga tushdi'));

// Graceful shutdown.
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
