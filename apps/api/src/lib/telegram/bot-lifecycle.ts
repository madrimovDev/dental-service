import type { Telegraf } from 'telegraf';
import { logger } from '../logger.ts';

/** Telegraf'ning lifecycle uchun kerakli yuzasi (testda soxta bot bilan almashtiriladi). */
export type LifecycleBot = {
  /** `onLaunch` getMe() muvaffaqiyatidan KEYIN, polling boshlanishidan OLDIN chaqiriladi. */
  launch(onLaunch: () => void): Promise<void>;
  stop(reason: string): void;
};

const cancelledError = () =>
  Object.assign(new Error('bot launch cancelled'), { name: 'AbortError' });

/**
 * Haqiqiy Telegraf instansiyasini lifecycle yuzasiga moslaydi. `new Telegraf()`dan DARHOL
 * keyin (handlerlardan OLDIN) chaqirilishi shart — birinchi middleware shu yerda o'rnatiladi.
 *
 * FX-143 (review): Telegraf 4.16.3 `launch()` = getMe → onLaunch → `await deleteWebhook()` →
 * startPolling. onLaunch o'tgach, deleteWebhook kutilayotgan oynada `this.polling` hali yo'q —
 * `bot.stop()` `Bot is not running!` otadi va launch keyin startPolling'ga o'tib, hech kim
 * to'xtata olmaydigan poller qoldirardi (eski token bilan bemorlarga javob berish yoki bir xil
 * token bilan 409 Conflict). Shuning uchun `stop()` avval `cancelled` belgilaydi:
 * - `callApi` o'rami: stop polling'dan oldin kelgan bo'lsa `getUpdates` HECH QACHON
 *   yuborilmaydi — AbortError
 *   (Telegraf polling uni toza to'xtash deb qabul qiladi, launch resolve bo'ladi);
 * - birinchi middleware: to'xtatilgan botga kech kelgan update qayta ishlanmaydi.
 */
export function telegrafLifecycleBot(bot: Telegraf): LifecycleBot {
  let cancelled = false;
  /** stop() polling boshlanishidan OLDIN keldi — keyingi har qanday getUpdates bloklanadi. */
  let blockPolling = false;
  const telegram = bot.telegram;
  const callApi = telegram.callApi.bind(telegram) as (...args: unknown[]) => Promise<unknown>;
  telegram.callApi = ((method: string, ...rest: unknown[]) => {
    if (blockPolling && method === 'getUpdates') return Promise.reject(cancelledError());
    return callApi(method, ...rest);
  }) as typeof telegram.callApi;
  bot.use((_ctx, next) => (cancelled ? undefined : next()));
  return {
    launch: (onLaunch) => bot.launch({}, onLaunch),
    stop: (reason) => {
      cancelled = true;
      try {
        bot.stop(reason);
      } catch (err) {
        // Polling hali yo'q (getMe/deleteWebhook bosqichi). Oddiy stop'da (polling bor) blok
        // QO'YILMAYDI — Telegraf `syncUpdateOffset` getUpdates'i offset'ni tasdiqlashi kerak,
        // aks holda qayta ishlangan update'lar keyingi pollerga qayta yetkaziladi.
        blockPolling = true;
        throw err;
      }
    },
  };
}

type Entry<B extends LifecycleBot> = { bot: B; cancelled: boolean };

/**
 * Per-tenant bot ro'yxati va xavfsiz boshlash/to'xtatish.
 *
 * - FX-143 (LC-21): bir tenant uchun launch/reload/stop VAQT BO'YICHA KETMA-KET (promise
 *   zanjiri) — parallel reload/bootAll ikkita poller (Telegram 409 Conflict) yaratmasin;
 *   `start` boshida mavjud bot to'xtatiladi.
 * - FX-40 (LA-20): `bot.stop()` Telegraf'da ishga tushmagan bot uchun `Bot is not running!`
 *   otadi — try/catch, ro'yxatdan har holda o'chiriladi. Launch yiqilsa (noto'g'ri token,
 *   tarmoq) o'sha instance ro'yxatdan o'chadi, keyingi reload yangi token bilan ishga tushadi.
 *   Hali launch bo'layotgan (getMe kutilayotgan) bot stop qilinsa — `cancelled` belgilanadi va
 *   `onLaunch`da launch to'xtatiladi (polling umuman boshlanmaydi). onLaunch'dan keyingi
 *   (deleteWebhook) oyna `telegrafLifecycleBot` ichida yopiladi.
 */
export function createBotLifecycle<B extends LifecycleBot>(opts: {
  create: (tenantId: string, token: string) => B;
}) {
  const bots = new Map<string, Entry<B>>();
  const chains = new Map<string, Promise<unknown>>();

  const serialize = <T>(tenantId: string, fn: () => Promise<T>): Promise<T> => {
    const prev = chains.get(tenantId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    chains.set(tenantId, tail);
    // Zanjir cheksiz o'smasin
    void tail.then(() => {
      if (chains.get(tenantId) === tail) chains.delete(tenantId);
    });
    return next;
  };

  const stopEntry = (tenantId: string, reason: string) => {
    const entry = bots.get(tenantId);
    if (!entry) return;
    entry.cancelled = true;
    bots.delete(tenantId);
    try {
      entry.bot.stop(reason);
    } catch (err) {
      // Telegraf: 'Bot is not running!' — launch hali tugamagan/yiqilgan; xavfsiz.
      logger.warn({ err, tenantId }, 'bot stop: was not running');
    }
  };

  const startNow = (tenantId: string, token: string) => {
    stopEntry(tenantId, 'restart');
    const entry: Entry<B> = { bot: opts.create(tenantId, token), cancelled: false };
    bots.set(tenantId, entry);
    // NOTE: `bot.launch()` start'da resolve bo'lmaydi — faqat stop()'dan keyin (Telegraf polling
    // loop). Shuning uchun await QILINMAYDI (aks holda bootAll osilib qoladi).
    void entry.bot
      .launch(() => {
        if (entry.cancelled) throw new Error('bot launch cancelled');
      })
      .catch((err) => {
        if (!entry.cancelled) logger.error({ err, tenantId }, 'bot launch failed');
        // FX-40: yiqilgan bot ro'yxatda qolmasin (faqat shu instance bo'lsa).
        if (bots.get(tenantId) === entry) bots.delete(tenantId);
      });
    logger.info({ tenantId }, 'Telegram bot launched');
  };

  return {
    start: (tenantId: string, token: string) =>
      serialize(tenantId, async () => startNow(tenantId, token)),
    stop: (tenantId: string) => serialize(tenantId, async () => stopEntry(tenantId, 'stop')),
    /** Token'ni zanjir ichida o'qib qayta ishga tushiradi (null → faqat to'xtatiladi). */
    reload: (tenantId: string, readToken: () => Promise<string | null>) =>
      serialize(tenantId, async () => {
        stopEntry(tenantId, 'reload');
        const token = await readToken();
        if (token) startNow(tenantId, token);
      }),
    /** Hammasini to'xtatadi; bittasining xatosi qolganlarini to'xtatmaydi. */
    stopAll: () => {
      for (const tenantId of [...bots.keys()]) stopEntry(tenantId, 'shutdown');
    },
    has: (tenantId: string) => bots.has(tenantId),
    size: () => bots.size,
  };
}
