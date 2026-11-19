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
/** FX-42 — oilada bemor tanlash tugmasi: `pt:<patientId>` (≤ 64 bayt). */
export const PATIENT_PREFIX = 'pt';
const SELECTION_TTL_MS = 24 * 60 * 60_000;

type Linked = { patientId: string; lang: BotLang };
type ChatPatient = { id: string; name: string };
/** `linked` — bitta aniq bemor; `choose` — chat'da bir nechta bemor, hali tanlanmagan. */
type ChatState = {
  options: ChatPatient[];
  lang: BotLang;
  linked: Linked | null;
};

export type FlowDeps = {
  appointments: Pick<AppointmentsService, 'listDoctors' | 'update'>;
  schedule: Pick<ScheduleService, 'getAvailability'>;
  now?: () => Date;
  /** Test/DI — chat uchun tanlangan bemor (`tenantId:chatId` → bemor). */
  selection?: Map<string, { patientId: string; expiresAt: number }>;
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

  const selection = deps.selection ?? new Map<string, { patientId: string; expiresAt: number }>();
  const nowMs = () => deps.now?.().getTime() ?? Date.now();
  const chatKey = (tenantId: string, chatId: string) => `${tenantId}:${chatId}`;

  /**
   * FX-42 (LA-21): bir chat'ga bir nechta bemor (oila) bog'lanishi mumkin. Bitta bo'lsa —
   * o'sha; bir nechta bo'lsa — foydalanuvchi tanlagan (24 soat) bemor, tanlanmagan bo'lsa
   * `linked = null` (chaqiruvchi tanlash menyusini ko'rsatadi; jim «eng eskisi» olinmaydi).
   */
  async function resolveChat(
    tx: DbOrTx,
    tenantId: string,
    chatId: string,
  ): Promise<ChatState | null> {
    const rows = await tx
      .select({ id: patients.id, name: patients.fullName, pref: patients.preferredLanguage })
      .from(patients)
      .where(eq(patients.telegramChatId, chatId))
      .orderBy(asc(patients.createdAt), asc(patients.id));
    if (rows.length === 0) return null;
    const [t] = await tx
      .select({ lang: tenants.defaultLanguage })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    const tenantLang = toBotLang(t?.lang);
    const options = rows.map((r) => ({ id: r.id, name: r.name }));
    const linkedOf = (r: (typeof rows)[number]): Linked => ({
      patientId: r.id,
      lang: toBotLang(r.pref, tenantLang),
    });
    const first = rows[0] as (typeof rows)[number];
    if (rows.length === 1) {
      selection.delete(chatKey(tenantId, chatId));
      return { options, lang: linkedOf(first).lang, linked: linkedOf(first) };
    }
    const sel = selection.get(chatKey(tenantId, chatId));
    const chosen =
      sel && sel.expiresAt >= nowMs() ? rows.find((r) => r.id === sel.patientId) : undefined;
    return {
      options,
      lang: linkedOf(chosen ?? first).lang,
      linked: chosen ? linkedOf(chosen) : null,
    };
  }

  const patientPicker = (state: ChatState): BotReply => ({
    text: botMessages(state.lang).choosePatient,
    buttons: state.options.map((o) => [{ text: o.name, data: `${PATIENT_PREFIX}:${o.id}` }]),
  });

  const menu = (lang: BotLang, multi = false): BotReply => {
    const m = botMessages(lang);
    return {
      text: m.menuPrompt,
      keyboard: [
        [m.menuBook, m.menuQuestionnaire],
        multi ? [m.menuLang, m.menuPatient] : [m.menuLang],
      ],
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
    const st = await resolveChat(tx, tenantId, chatId);
    if (!st) return notLinked();
    if (!st.linked) return patientPicker(st);
    return menu(st.linked.lang, st.options.length > 1);
  }

  async function onCommand(
    tx: DbOrTx,
    a: { tenantId: string; chatId: string; command: 'book' | 'anketa' | 'lang' | 'menu' },
  ): Promise<BotReply> {
    const st = await resolveChat(tx, a.tenantId, a.chatId);
    if (!st) return notLinked();
    if (!st.linked) return patientPicker(st);
    const l = st.linked;
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
    return menu(l.lang, st.options.length > 1);
  }

  async function onText(
    tx: DbOrTx,
    a: { tenantId: string; chatId: string; text: string },
  ): Promise<BotReply> {
    const st = await resolveChat(tx, a.tenantId, a.chatId);
    if (!st) return notLinked();
    if (!st.linked) return patientPicker(st);
    const l = st.linked;
    const multi = st.options.length > 1;
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
      if (multi && a.text === m.menuPatient) return patientPicker({ ...st, lang });
    }
    if (questionnaire.isActive(ctx)) {
      const r = await questionnaire.answer(ctx, a.text);
      if (r) return r;
    }
    return menu(l.lang, multi);
  }

  async function onCallback(
    tx: DbOrTx,
    a: { tenantId: string; chatId: string; data: string },
  ): Promise<FlowResult> {
    const st = await resolveChat(tx, a.tenantId, a.chatId);
    if (!st) return { reply: null, toast: botMessages('uz').notLinked };
    const multi = st.options.length > 1;

    /** Chat'ning faol bemorini almashtiradi; eski bemorning yarim qolgan oqimlari tozalanadi. */
    const selectPatient = (patientId: string) => {
      const k = chatKey(a.tenantId, a.chatId);
      if (selection.get(k)?.patientId !== patientId) {
        booking.sessions.delete(k);
        questionnaire.sessions.delete(k);
      }
      selection.set(k, { patientId, expiresAt: nowMs() + SELECTION_TTL_MS });
    };

    if (a.data.startsWith(`${PATIENT_PREFIX}:`)) {
      const chosen = st.options.find((o) => `${PATIENT_PREFIX}:${o.id}` === a.data);
      // Faqat shu chat'ga bog'langan bemor tanlanadi (begona/boshqa oila id'si → rad).
      if (!chosen) return { reply: null, toast: botMessages(st.lang).notYours };
      selectPatient(chosen.id);
      const lang = toBotLang(
        (
          await tx
            .select({ pref: patients.preferredLanguage })
            .from(patients)
            .where(eq(patients.id, chosen.id))
            .limit(1)
        )[0]?.pref,
        st.lang,
      );
      return { reply: { ...menu(lang, multi), text: botMessages(lang).patientSet(chosen.name) } };
    }

    const rem = parseReminderCallback(a.data);
    // Eslatma tugmasi egasi yozilishning O'Z bemori (handleReminderAction chat egaligini
    // tekshiradi) — faol bemor tanlanmagan bo'lsa ham ishlaydi.
    const l = st.linked ?? { patientId: (st.options[0] as ChatPatient).id, lang: st.lang };
    if (!rem && !st.linked) return { reply: patientPicker(st) };
    const m = botMessages(l.lang);
    const ctx = {
      tx,
      tenantId: a.tenantId,
      chatId: a.chatId,
      patientId: l.patientId,
      lang: l.lang,
    };

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
        case 'unavailable':
          return { reply: { text: m.reminderUnavailable } };
        case 'reschedule': {
          // Eslatma egasi (r.patientId) shu chat'ning bemori — oqim shu bemor nomidan.
          const owner = r.patientId ?? l.patientId;
          if (st.options.some((o) => o.id === owner)) selectPatient(owner);
          const reply = await booking.start(
            { ...ctx, patientId: owner },
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
      return { reply: { ...menu(lang, multi), text: botMessages(lang).langSet } };
    }
    return { reply: null };
  }

  return { menuFor, onCommand, onText, onCallback, booking, questionnaire };
}

export type TelegramFlows = ReturnType<typeof createTelegramFlows>;
