import { patients } from '@dental/db-schema';
import { eq } from 'drizzle-orm';
import IORedis from 'ioredis';
import { Telegraf } from 'telegraf';
import type { Database, DbOrTx } from '../db/client.ts';
import { decryptSecret } from './crypto.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';

export const normalizePhone = (raw: string): string => {
  const digits = raw.replace(/[^\d]/g, '');
  return `+${digits}`;
};

type ManagerDeps = {
  adminDb: Database;
  withTenant: <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>) => Promise<T>;
};

/** Bir tenantning telegram token'ini o'qib bot ishga tushiradi (null → yo'q). */
async function readToken(adminDb: Database, tenantId: string): Promise<string | null> {
  const { tenantSettings } = await import('@dental/db-schema');
  const [row] = await adminDb
    .select({ s: tenantSettings.integrationSettings })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);
  const enc = (row?.s as { telegram?: { botTokenEnc?: string } } | null)?.telegram?.botTokenEnc;
  return enc ? decryptSecret(enc) : null;
}

export function startTelegramBotManager(deps: ManagerDeps) {
  const bots = new Map<string, Telegraf>();

  const launch = async (tenantId: string, token: string) => {
    const bot = new Telegraf(token);
    bot.start((ctx) =>
      ctx.reply('Telefon raqamingizni ulashing:', {
        reply_markup: {
          keyboard: [[{ text: '📱 Telefonni ulashish', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }),
    );
    bot.on('contact', async (ctx) => {
      const phone = normalizePhone(ctx.message.contact.phone_number);
      const chatId = String(ctx.chat.id);
      const outcome = await deps.withTenant(tenantId, async (tx) => {
        const [p] = await tx
          .select({ id: patients.id })
          .from(patients)
          .where(eq(patients.phone, phone))
          .limit(1);
        if (!p) return 'not_found';
        await tx.update(patients).set({ telegramChatId: chatId }).where(eq(patients.id, p.id));
        return 'linked';
      });
      await ctx.reply(
        outcome === 'linked'
          ? "✅ Bog'landingiz — endi eslatmalar shu yerga keladi."
          : '⚠️ Raqamingiz topilmadi. Klinikaga murojaat qiling.',
      );
    });
    await bot.launch(); // long-poll (non-blocking promise resolves when started)
    bots.set(tenantId, bot);
    logger.info({ tenantId }, 'Telegram bot launched');
  };

  const stop = async (tenantId: string) => {
    const bot = bots.get(tenantId);
    if (bot) {
      bot.stop('reload');
      bots.delete(tenantId);
    }
  };

  const reload = async (tenantId: string) => {
    await stop(tenantId);
    const token = await readToken(deps.adminDb, tenantId);
    if (token) await launch(tenantId, token);
  };

  // Boot: launch every tenant that currently has a telegram token.
  const bootAll = async () => {
    const { tenantSettings } = await import('@dental/db-schema');
    const rows = await deps.adminDb
      .select({ tenantId: tenantSettings.tenantId, s: tenantSettings.integrationSettings })
      .from(tenantSettings);
    for (const r of rows) {
      const enc = (r.s as { telegram?: { botTokenEnc?: string } } | null)?.telegram?.botTokenEnc;
      if (enc) await launch(r.tenantId, decryptSecret(enc));
    }
  };

  // Redis pub/sub reload channel.
  const sub = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  sub.subscribe('telegram:reload');
  sub.on('message', (_ch, tenantId) => {
    void reload(tenantId).catch((err) => logger.error({ err, tenantId }, 'bot reload failed'));
  });

  void bootAll().catch((err) => logger.error({ err }, 'bot bootAll failed'));

  const stopAll = async () => {
    for (const [, bot] of bots) bot.stop('shutdown');
    bots.clear();
    await sub.quit();
  };

  return { reload, stopAll };
}
