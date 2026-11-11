/** Bot javobi: matn + (ixtiyoriy) inline tugmalar / doimiy menyu. Telegraf'dan mustaqil — testlanadi. */
export type BotButton = { text: string; data: string };
export type BotReply = {
  text: string;
  buttons?: BotButton[][];
  /** Doimiy (reply) klaviatura — asosiy menyu. */
  keyboard?: string[][];
};

/** Telegraf `extra` (reply_markup) ko'rinishi. */
export const toTelegrafExtra = (r: BotReply) => {
  if (r.buttons) {
    return {
      reply_markup: {
        inline_keyboard: r.buttons.map((row) =>
          row.map((b) => ({ text: b.text, callback_data: b.data })),
        ),
      },
    };
  }
  if (r.keyboard) {
    return {
      reply_markup: {
        keyboard: r.keyboard.map((row) => row.map((text) => ({ text }))),
        resize_keyboard: true,
      },
    };
  }
  return {};
};
