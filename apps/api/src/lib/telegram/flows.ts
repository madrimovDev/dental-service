import { patients, tenants } from '@dental/db-schema';
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import type { AppointmentsService } from '../../modules/appointments/index.ts';
import type { ScheduleService } from '../../modules/schedule/index.ts';
import { BOOKING_PREFIX, createBookingFlow } from './booking.ts';
import { type BotLang, botMessages, toBotLang } from './messages.ts';
import { createQuestionnaireFlow, QUESTIONNAIRE_PREFIX } from './questionnaire.ts';
import { handleReminderAction, parseReminderCallback } from './reminder-actions.ts';
import type { BotReply } from './reply.ts';

export const LANG_PREFIX = 'lg';

type Linked = { patientId: string; lang: BotLang };

export type FlowDeps = {
  appointments: Pick<AppointmentsService, 'listDoctors' | 'update'>;
  schedule: Pick<ScheduleService, 'getAvailability'>;
  now?: () => Date;
};

export type FlowResult = { reply: BotReply | null; toast?: string };

/**
 * Bot suhbat oqimlarining yagona kirish nuqtasi — Telegraf'siz (testlanadi).
 * Barcha metodlar tenant-RLS `tx` oladi. Faqat **bog'langan** (telegram_chat_id)
 * bemor bilan ishlanadi; boshqa chat → «Avval raqamingizni ulashing».
 */
export function createTelegramFlows(deps: FlowDeps) {
  const booking = createBookingFlow({
    schedule: deps.schedule,
    appointments: deps.appointments,
    now: deps.now,
  });
  const questionnaire = createQuestionnaireFlow({ now: deps.now });

  async function resolveLinked(
    tx: DbOrTx,
    tenantId: string,
    chatId: string,
  ): Promise<Linked | null> {
    // Bir chat'ga bir nechta bemor bog'lanishi mumkin (oila) — deterministik: eng eskisi.
    const [p] = await tx
      .select({ id: patients.id, pref: patients.preferredLanguage })
      .from(patients)
      .where(eq(patients.telegramChatId, chatId))
      .orderBy(asc(patients.createdAt))
      .limit(1);
    if (!p) return null;
    const [t] = await tx
      .select({ lang: tenants.defaultLanguage })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    return { patientId: p.id, lang: toBotLang(p.pref, toBotLang(t?.lang)) };
  }

  const menu = (lang: BotLang): BotReply => {
    const m = botMessages(lang);
    return {
      text: m.menuPrompt,
      keyboard: [[m.menuBook, m.menuQuestionnaire], [m.menuLang]],
    };
  };

  const notLinked = (): BotReply => ({ text: botMessages('uz').notLinked });

  const langPicker = (lang: BotLang): BotReply => ({
    text: botMessages(lang).langPrompt,
    buttons: [
      [
        { text: "O'zbekcha", data: `${LANG_PREFIX}:uz` },
        { text: 'Русский', data: `${LANG_PREFIX}:ru` },
      ],
    ],
  });

  /** Bog'langandan keyin menyu (contact handler chaqiradi). */
  async function menuFor(tx: DbOrTx, tenantId: string, chatId: string): Promise<BotReply> {
    const l = await resolveLinked(tx, tenantId, chatId);
    return l ? menu(l.lang) : notLinked();
  }

  async function onCommand(
    tx: DbOrTx,
    a: { tenantId: string; chatId: string; command: 'book' | 'anketa' | 'lang' | 'menu' },
  ): Promise<BotReply> {
    const l = await resolveLinked(tx, a.tenantId, a.chatId);
    if (!l) return notLinked();
    const ctx = {
      tx,
      tenantId: a.tenantId,
      chatId: a.chatId,
      patientId: l.patientId,
      lang: l.lang,
    };
    if (a.command === 'book') return booking.start(ctx);
    if (a.command === 'anketa') return questionnaire.start(ctx);
    if (a.command === 'lang') return langPicker(l.lang);
    return menu(l.lang);
  }

  async function onText(
    tx: DbOrTx,
    a: { tenantId: string; chatId: string; text: string },
  ): Promise<BotReply> {
    const l = await resolveLinked(tx, a.tenantId, a.chatId);
    if (!l) return notLinked();
    const ctx = {
      tx,
      tenantId: a.tenantId,
      chatId: a.chatId,
      patientId: l.patientId,
      lang: l.lang,
    };
    // Menyu tugmalari (ikkala til) anketa javobidan USTUN — anketa o'rtasida ham chiqish mumkin.
    for (const lang of ['uz', 'ru'] as const) {
      const m = botMessages(lang);
      if (a.text === m.menuBook) return booking.start({ ...ctx, lang });
      if (a.text === m.menuQuestionnaire) return questionnaire.start({ ...ctx, lang });
      if (a.text === m.menuLang) return langPicker(lang);
    }
    if (questionnaire.isActive(ctx)) {
      const r = await questionnaire.answer(ctx, a.text);
      if (r) return r;
    }
    return menu(l.lang);
  }

  async function onCallback(
    tx: DbOrTx,
    a: { tenantId: string; chatId: string; data: string },
  ): Promise<FlowResult> {
    const l = await resolveLinked(tx, a.tenantId, a.chatId);
    if (!l) return { reply: null, toast: botMessages('uz').notLinked };
    const m = botMessages(l.lang);
    const ctx = {
      tx,
      tenantId: a.tenantId,
      chatId: a.chatId,
      patientId: l.patientId,
      lang: l.lang,
    };

    const rem = parseReminderCallback(a.data);
    if (rem) {
      const r = await handleReminderAction(
        tx,
        { appointments: deps.appointments },
        {
          tenantId: a.tenantId,
          chatId: a.chatId,
          action: rem.action,
          appointmentId: rem.appointmentId,
        },
      );
      switch (r.outcome) {
        case 'confirmed':
          return { reply: { text: m.reminderConfirmedReply } };
        case 'cancelled':
          return { reply: { text: m.reminderCancelledReply } };
        case 'already':
          return { reply: null, toast: m.reminderAlready };
        case 'reschedule': {
          // Eslatma egasi (r.patientId) shu chat'ning bemori — oqim shu bemor nomidan.
          const reply = await booking.start(
            { ...ctx, patientId: r.patientId ?? l.patientId },
            { rescheduleOf: r.appointmentId ?? null },
          );
          return { reply };
        }
        case 'not_found':
          return { reply: null, toast: m.notFound };
        default:
          return { reply: null, toast: m.notYours };
      }
    }
    if (a.data.startsWith(`${BOOKING_PREFIX}:`)) {
      return { reply: await booking.handle(ctx, a.data) };
    }
    if (a.data === `${QUESTIONNAIRE_PREFIX}:skip`) {
      return { reply: await questionnaire.answer(ctx, null) };
    }
    if (a.data === `${LANG_PREFIX}:uz` || a.data === `${LANG_PREFIX}:ru`) {
      const lang = a.data.endsWith('ru') ? 'ru' : 'uz';
      await tx
        .update(patients)
        .set({ preferredLanguage: lang })
        .where(eq(patients.id, l.patientId));
      return { reply: { ...menu(lang), text: botMessages(lang).langSet } };
    }
    return { reply: null };
  }

  return { menuFor, onCommand, onText, onCallback, booking, questionnaire };
}

export type TelegramFlows = ReturnType<typeof createTelegramFlows>;
