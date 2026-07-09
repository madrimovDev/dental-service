import { patients } from '@dental/db-schema';
import { asc, eq, inArray } from 'drizzle-orm';
import IORedis from 'ioredis';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
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
    // CLI-475 B7 — `message('contact')` filter (Telegraf'ning eskirgan
    // `bot.on('contact', …)` overload'i o'rniga); `ctx.message.contact` tip-xavfsiz.
    bot.on(message('contact'), async (ctx) => {
      const phone = normalizePhone(ctx.message.contact.phone_number);
      const chatId = String(ctx.chat.id);
      const outcome = await deps.withTenant(tenantId, async (tx) => {
        // CLI-475 B7 — bir xil telefonli bir nechta bemor bo'lsa (tenant ichida
        // dublikat telefon mumkin), tartibsiz `.limit(1)` DB-tartibiga bog'liq
        // bo'lardi. Deterministik: eng eski bemor (createdAt asc) bog'lanadi.
        const [p] = await tx
          .select({ id: patients.id })
          .from(patients)
          .where(inArray(patients.phone, [phone, phone.replace(/^\+/, '')]))
          .orderBy(asc(patients.createdAt))
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
    // NOTE: `bot.launch()`'s promise does NOT resolve on start — it resolves only
    // after `bot.stop()` (Telegraf's `Polling.loop()` is a `for await` that runs
    // until `abortController.abort()`; confirmed against the installed
    // `telegraf` source, `node_modules/telegraf/lib/polling.js`). `await`-ing it
    // here would hang `bootAll()`'s per-tenant loop on the first tenant with a
    // token, and `bots.set(...)` below would never run during normal operation.
    // Fire-and-forget instead — same API, just not awaited.
    void bot.launch().catch((err) => logger.error({ err, tenantId }, 'bot launch failed'));
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
      try {
        const enc = (r.s as { telegram?: { botTokenEnc?: string } } | null)?.telegram?.botTokenEnc;
        if (enc) await launch(r.tenantId, decryptSecret(enc));
      } catch (err) {
        logger.error({ err, tenantId: r.tenantId }, 'bot bootAll: tenant failed, skipping');
      }
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
