import { logger } from '../logger.ts';

/** Telegraf'ning lifecycle uchun kerakli yuzasi (testda soxta bot bilan almashtiriladi). */
export type LifecycleBot = {
  /** `onLaunch` getMe() muvaffaqiyatidan KEYIN, polling boshlanishidan OLDIN chaqiriladi. */
  launch(onLaunch: () => void): Promise<void>;
  stop(reason: string): void;
};

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
 *   `onLaunch`da launch to'xtatiladi (polling umuman boshlanmaydi).
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
