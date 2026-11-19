import { normalizePhone } from '@dental/core';
import { patients } from '@dental/db-schema';
import { asc, eq, inArray } from 'drizzle-orm';
import IORedis from 'ioredis';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import type { Database, DbOrTx } from '../db/client.ts';
import { expireAndNotifyStaleBookingRequests } from '../modules/booking-requests/booking-requests.repository.ts';
import { decryptSecret } from './crypto.ts';
import { env } from './env.ts';
import { logger } from './logger.ts';
import { createBotLifecycle, type LifecycleBot } from './telegram/bot-lifecycle.ts';
import { createBotFlows } from './telegram/deps.ts';
import type { TelegramFlows } from './telegram/flows.ts';
import { createPatientMessenger } from './telegram/notify.ts';
import {
  bindPhoneVerification,
  hasPendingPhoneVerification,
  PV_START_PREFIX,
  parsePhoneVerifyPayload,
  phoneVerifyReplies,
  phoneVerifyReplyFor,
  verifyPhoneByContact,
} from './telegram/phone-verify.ts';
import { type BotReply, toTelegrafExtra } from './telegram/reply.ts';

type ManagerDeps = {
  adminDb: Database;
  withTenant: <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>) => Promise<T>;
  /** Test/DI — default `createBotFlows(adminDb)` (UI-T2 suhbat oqimlari). */
  flows?: TelegramFlows;
};

/** 24 soatdan eski `pending` bron so'rovlarini yopish davri (cross-tenant, admin conn). */
const BOOKING_EXPIRY_INTERVAL_MS = 60 * 60_000;

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

export type LinkOutcome =
  | 'linked'
  | 'not_found'
  | 'not_own_contact'
  | 'already_linked'
  | 'not_private';

/**
 * P8 — kontakt egaligi: faqat foydalanuvchining O'Z kontakti (`contact.user_id`
 * === `from.id`) bemorni bog'laydi; mavjud boshqa chat'ga bog'lanish ustiga
 * yozilmaydi.
 */
export async function linkPatientByContact(
  tx: DbOrTx,
  o: {
    contactUserId: number | undefined;
    fromId: number;
    phone: string;
    chatId: string;
    chatType: string | undefined;
  },
): Promise<LinkOutcome> {
  // FX-84: faqat shaxsiy chat — guruh chat_id'si bemorga yozilsa, eslatma/chek/retsept
  // (PHI) guruhga ketardi.
  if (o.chatType !== 'private') return 'not_private';
  if (o.contactUserId === undefined || o.contactUserId !== o.fromId) return 'not_own_contact';
  // FX-42 (LA-21): oilaviy telefon — shu raqamdagi BARCHA bemorlar (ona + bolalar) bir chat'ga
  // bog'lanadi; har bemor o'z chat_id'sini saqlaydi, shuning uchun eslatma/chek/retsept
  // har birining o'z yozuvi bo'yicha yetadi. Boshqa chat'ga bog'langanlarga tegilmaydi.
  const matches = await tx
    .select({ id: patients.id, chat: patients.telegramChatId })
    .from(patients)
    .where(inArray(patients.phone, [o.phone, o.phone.replace(/^\+/, '')]))
    .orderBy(asc(patients.createdAt));
  if (matches.length === 0) return 'not_found';
  const free = matches.filter((p) => !p.chat).map((p) => p.id);
  const mine = matches.some((p) => p.chat === o.chatId);
  if (free.length > 0) {
    await tx.update(patients).set({ telegramChatId: o.chatId }).where(inArray(patients.id, free));
  }
  if (free.length === 0 && !mine) return 'already_linked';
  return 'linked';
}

export function startTelegramBotManager(deps: ManagerDeps) {
  const flows = deps.flows ?? createBotFlows(deps.adminDb);

  /** Telegraf instansiyasini handlerlar bilan quradi (ishga tushirmaydi). */
  const buildBot = (tenantId: string, token: string): LifecycleBot => {
    const bot = new Telegraf(token);
    const run = <T>(fn: (tx: DbOrTx) => Promise<T>) => deps.withTenant(tenantId, fn);
    const send = (ctx: { reply: (t: string, e?: object) => Promise<unknown> }, r: BotReply) =>
      ctx.reply(r.text, toTelegrafExtra(r));
    const askContact = (ctx: { reply: (t: string, e?: object) => Promise<unknown> }) =>
      ctx.reply('Telefon raqamingizni ulashing:', {
        reply_markup: {
          keyboard: [[{ text: '📱 Telefonni ulashish', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    bot.catch((err) => logger.error({ err, tenantId }, 'bot handler failed'));

    bot.start(async (ctx) => {
      // FU-15: `/start pv_<token>` — xodim telefonini tasdiqlash (bemor oqimidan alohida).
      // `ctx.payload` faqat shu prefiks bilan bo'lsa ushlanadi; aks holda bemor menyusi.
      if (ctx.payload?.startsWith(PV_START_PREFIX)) {
        // Faqat shaxsiy chat: guruhda token guruh chat'iga bog'lanib, boshqa a'zo kontakti
        // bilan tasdiqlanib qolmasin (verifier topdi).
        if (ctx.chat.type !== 'private') {
          await ctx.reply(phoneVerifyReplies.invalidLink);
          return;
        }
        const pvToken = parsePhoneVerifyPayload(ctx.payload);
        const outcome = pvToken
          ? await bindPhoneVerification(deps.adminDb, {
              tenantId,
              token: pvToken,
              chatId: String(ctx.chat.id),
            })
          : 'invalid';
        if (outcome !== 'bound') {
          await ctx.reply(phoneVerifyReplies.invalidLink);
          return;
        }
        await ctx.reply(phoneVerifyReplies.askContact, {
          reply_markup: {
            keyboard: [[{ text: phoneVerifyReplies.shareButton, request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
        return;
      }
      const menu = await run((tx) => flows.menuFor(tx, tenantId, String(ctx.chat.id)));
      // Bog'langan bemor — menyu; aks holda kontakt so'raladi (P8).
      if (menu.keyboard) await send(ctx, menu);
      else await askContact(ctx);
    });
    for (const command of ['book', 'anketa', 'lang', 'menu'] as const) {
      bot.command(command, async (ctx) => {
        const r = await run((tx) =>
          flows.onCommand(tx, { tenantId, chatId: String(ctx.chat.id), command }),
        );
        await send(ctx, r);
      });
    }
    // CLI-475 B7 — `message('contact')` filter (Telegraf'ning eskirgan
    // `bot.on('contact', …)` overload'i o'rniga); `ctx.message.contact` tip-xavfsiz.
    bot.on(message('contact'), async (ctx) => {
      // H1 — kanonik `@dental/core` funksiyasi (lokal nusxa o'chirildi).
      // Telegram 9 xonali mahalliy raqam ham qaytarishi mumkin; eski nusxa uni
      // `+901234567` qilib bemorni topa olmasdi.
      const phone = normalizePhone(ctx.message.contact.phone_number);
      const chatId = String(ctx.chat.id);
      // FU-15: shu chat'da xodim telefoni tasdig'i kutilayotgan bo'lsa — kontakt shu
      // oqimga tegishli (bemor bog'lashga tushmaydi). Platform jadvallari → admin ulanish.
      if (
        ctx.chat.type === 'private' &&
        (await hasPendingPhoneVerification(deps.adminDb, { tenantId, chatId }))
      ) {
        const pv = await verifyPhoneByContact(deps.adminDb, {
          tenantId,
          chatId,
          contactUserId: ctx.message.contact.user_id,
          fromId: ctx.from.id,
          phone: ctx.message.contact.phone_number,
        });
        await ctx.reply(phoneVerifyReplyFor(pv), { reply_markup: { remove_keyboard: true } });
        return;
      }
      const outcome = await deps.withTenant(tenantId, (tx) =>
        linkPatientByContact(tx, {
          contactUserId: ctx.message.contact.user_id,
          fromId: ctx.from.id,
          phone,
          chatId,
          chatType: ctx.chat.type,
        }),
      );
      const replies: Record<LinkOutcome, string> = {
        linked: "✅ Bog'landingiz — endi eslatmalar shu yerga keladi.",
        not_found: '⚠️ Raqamingiz topilmadi. Klinikaga murojaat qiling.',
        not_own_contact: "⚠️ Faqat o'z raqamingizni ulashing.",
        not_private: '⚠️ Raqamni faqat botning shaxsiy chatida ulashing.',
        already_linked:
          "⚠️ Bu raqam boshqa Telegram hisobiga bog'langan. Klinikaga murojaat qiling.",
      };
      await ctx.reply(replies[outcome]);
      if (outcome === 'linked') {
        await send(ctx, await run((tx) => flows.menuFor(tx, tenantId, chatId)));
      }
    });
    // Menyu tugmalari va anketa javoblari (matn). Kontakt/komandalar yuqorida ushlanadi.
    bot.on(message('text'), async (ctx) => {
      const r = await run((tx) =>
        flows.onText(tx, { tenantId, chatId: String(ctx.chat.id), text: ctx.message.text }),
      );
      await send(ctx, r);
    });
    // Inline tugmalar: eslatma (rm:), bron (bk:), anketa (qs:), til (lg:).
    bot.on('callback_query', async (ctx) => {
      const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;
      const chatId = ctx.chat?.id;
      if (!data || chatId === undefined) {
        await ctx.answerCbQuery();
        return;
      }
      const res = await run((tx) =>
        flows.onCallback(tx, { tenantId, chatId: String(chatId), data }),
      );
      await ctx.answerCbQuery(res.toast);
      if (res.reply) await send(ctx, res.reply);
    });
    return {
      launch: (onLaunch) => bot.launch({}, onLaunch),
      stop: (reason) => bot.stop(reason),
    };
  };

  // FX-40/FX-143: launch/stop/reload per-tenant ketma-ket, stop xatosiga chidamli.
  const lifecycle = createBotLifecycle({ create: buildBot });

  const reload = (tenantId: string) =>
    lifecycle.reload(tenantId, () => readToken(deps.adminDb, tenantId));

  // Boot: launch every tenant that currently has a telegram token.
  const bootAll = async () => {
    const { tenantSettings } = await import('@dental/db-schema');
    const rows = await deps.adminDb
      .select({ tenantId: tenantSettings.tenantId, s: tenantSettings.integrationSettings })
      .from(tenantSettings);
    for (const r of rows) {
      try {
        const enc = (r.s as { telegram?: { botTokenEnc?: string } } | null)?.telegram?.botTokenEnc;
        // Token zanjir ichida QAYTA o'qiladi — boot snapshot'i kechikib, orada kelgan yangi token'ni bosmasin.
        if (enc) await reload(r.tenantId);
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

  // UI-T2/FX-24: muddati tugagan (24 soat yoki slot o'tgan) `pending` bron so'rovlari →
  // `expired` (admin conn, barcha tenantlar) + bemorga Telegram xabari.
  const messenger = createPatientMessenger();
  const expire = () =>
    expireAndNotifyStaleBookingRequests(deps.adminDb, messenger).catch((err) =>
      logger.error({ err }, 'booking request expiry failed'),
    );
  void expire();
  const expiryTimer = setInterval(() => void expire(), BOOKING_EXPIRY_INTERVAL_MS);
  expiryTimer.unref();

  const stopAll = async () => {
    clearInterval(expiryTimer);
    try {
      lifecycle.stopAll();
    } finally {
      await sub.quit();
    }
  };

  return { reload, stopAll };
}
