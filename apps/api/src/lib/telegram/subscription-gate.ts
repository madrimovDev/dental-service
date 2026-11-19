import { isTenantServiceBlocked } from '../subscription.ts';

/** Gate'ga kerakli Telegraf kontekst qismi (test uchun tor tip). */
type GateCtx = {
  callbackQuery?: object;
  answerCbQuery: (...args: never[]) => Promise<unknown>;
};

/**
 * FX-105 (LB-14): obuna/litsenziyasi `expired` tenant boti hech qanday oqimni
 * (bron so'rovi, anketa, «Kelaman/Bekor», bemorni bog'lash, xodim telefoni
 * tasdig'i) ishlatmaydi — HTTP blok bilan bir xil qoida (`isTenantServiceBlocked`).
 * Bot `launch` paytida emas, HAR yangilanishda tekshiriladi: renew bo'lgach
 * (kesh ≤ 30 s) bot qayta ishga tushirishsiz yana javob beradi.
 *
 * Bloklanganda javob yozilmaydi; faqat callback tugmasi «aylanib» qolmasligi uchun
 * toast'siz `answerCbQuery()` qilinadi (holat o'zgarmaydi).
 */
export const createBotSubscriptionGate =
  (tenantId: string) =>
  async (ctx: GateCtx, next: () => Promise<void>): Promise<void> => {
    if (await isTenantServiceBlocked(tenantId)) {
      if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => undefined);
      return;
    }
    await next();
  };
