import { medicalRecords } from '@dental/db-schema';
import type { DbOrTx } from '../../db/client.ts';
import {
  type BotLang,
  botMessages,
  OPTIONAL_QUESTION,
  QUESTIONNAIRE_KEYS,
  type QuestionnaireKey,
} from './messages.ts';
import type { BotReply } from './reply.ts';

export const QUESTIONNAIRE_PREFIX = 'qs';
const MAX_ANSWER_LEN = 500;
const SESSION_TTL_MS = 60 * 60_000;

type QSession = {
  patientId: string;
  idx: number;
  answers: Partial<Record<QuestionnaireKey, string>>;
  expiresAt: number;
};

export type QuestionnaireCtx = {
  tx: DbOrTx;
  tenantId: string;
  chatId: string;
  patientId: string;
  lang: BotLang;
};

/**
 * Anketa javoblarini `medical_records`ga QORALAMA sifatida yozadi
 * (`questionnaire_answers` + `questionnaire_at`). ⚠️ `allergies`/`chronicConditions`/
 * `currentMedications` va boshqa klinik maydonlarga HECH QACHON tegilmaydi —
 * shifokor «Anamnezni tasdiqlash» (UI-D2) bilan o'zi ko'chiradi.
 */
export async function saveQuestionnaireDraft(
  tx: DbOrTx,
  o: { tenantId: string; patientId: string; answers: Record<string, string>; now?: Date },
): Promise<void> {
  const at = o.now ?? new Date();
  await tx
    .insert(medicalRecords)
    .values({
      tenantId: o.tenantId,
      patientId: o.patientId,
      questionnaireAnswers: o.answers,
      questionnaireAt: at,
    })
    .onConflictDoUpdate({
      target: medicalRecords.patientId,
      set: { questionnaireAnswers: o.answers, questionnaireAt: at },
    });
}

export function createQuestionnaireFlow(
  deps: { sessions?: Map<string, QSession>; now?: () => Date } = {},
) {
  const sessions = deps.sessions ?? new Map<string, QSession>();
  const now = () => deps.now?.() ?? new Date();
  const key = (c: { tenantId: string; chatId: string }) => `${c.tenantId}:${c.chatId}`;

  const question = (ctx: QuestionnaireCtx, s: QSession): BotReply => {
    const m = botMessages(ctx.lang);
    const qk = QUESTIONNAIRE_KEYS[s.idx] as QuestionnaireKey;
    return {
      text: m.questions[qk],
      buttons:
        qk === OPTIONAL_QUESTION
          ? [[{ text: m.skip, data: `${QUESTIONNAIRE_PREFIX}:skip` }]]
          : undefined,
    };
  };

  const isActive = (ctx: { tenantId: string; chatId: string }): boolean => {
    const s = sessions.get(key(ctx));
    return !!s && s.expiresAt >= now().getTime();
  };

  function start(ctx: QuestionnaireCtx): BotReply {
    const m = botMessages(ctx.lang);
    const s: QSession = {
      patientId: ctx.patientId,
      idx: 0,
      answers: {},
      expiresAt: now().getTime() + SESSION_TTL_MS,
    };
    sessions.set(key(ctx), s);
    const q = question(ctx, s);
    return { ...q, text: `${m.questionnaireIntro}\n\n${q.text}` };
  }

  /** Matnli javob (yoki `skip`) — keyingi savol yoki yakun (qoralama yoziladi). */
  async function answer(ctx: QuestionnaireCtx, text: string | null): Promise<BotReply | null> {
    const k = key(ctx);
    const s = sessions.get(k);
    if (!s || s.patientId !== ctx.patientId || s.expiresAt < now().getTime()) {
      sessions.delete(k);
      return null;
    }
    const qk = QUESTIONNAIRE_KEYS[s.idx] as QuestionnaireKey;
    if (text === null) {
      // `skip` faqat ixtiyoriy savolda.
      if (qk !== OPTIONAL_QUESTION) return question(ctx, s);
    } else {
      s.answers[qk] = text.trim().slice(0, MAX_ANSWER_LEN);
    }
    s.idx += 1;
    if (s.idx < QUESTIONNAIRE_KEYS.length) return question(ctx, s);

    sessions.delete(k);
    await saveQuestionnaireDraft(ctx.tx, {
      tenantId: ctx.tenantId,
      patientId: ctx.patientId,
      answers: s.answers as Record<string, string>,
      now: now(),
    });
    return { text: botMessages(ctx.lang).questionnaireDone };
  }

  return { start, answer, isActive, sessions };
}

export type QuestionnaireFlow = ReturnType<typeof createQuestionnaireFlow>;
