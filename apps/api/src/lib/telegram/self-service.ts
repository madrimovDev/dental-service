import { appointments, branches, users } from '@dental/db-schema';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import type { PatientsService } from '../../modules/patients/patients.service.ts';
import { createBotContext } from './bot-context.ts';
import { type BotLang, botMessages, fmtMoney, fmtWhen } from './messages.ts';
import { reminderCallbackData } from './reminder-actions.ts';
import type { BotReply } from './reply.ts';

/** Bitta xabarda ko'rsatiladigan eng ko'p yozilish (Telegram tugma/matn chegarasi). */
const MAX_LISTED = 10;

export type SelfServiceCtx = {
  tx: DbOrTx;
  tenantId: string;
  patientId: string;
  lang: BotLang;
};

export type SelfServiceDeps = {
  patients?: Pick<PatientsService, 'balanceFor'>;
  now?: () => Date;
};

/**
 * FT-07 — bemorning O'Z ma'lumotlarini ko'rishi (faqat bog'langan chat'ning faol bemori).
 * Faqat yozilish vaqti/doktor/filial va balans SUMMASI — tibbiy yozuv/rasm/odontogramma yo'q.
 */
export function createSelfServiceFlow(deps: SelfServiceDeps) {
  const nowDate = () => deps.now?.() ?? new Date();

  /** Kelajakdagi faol yozilishlar + har biri uchun bekor tugmasi (`rm:no:<id>` — eslatma handler'i). */
  async function myAppointments(ctx: SelfServiceCtx): Promise<BotReply> {
    const m = botMessages(ctx.lang);
    const rows = await ctx.tx
      .select({
        id: appointments.id,
        startTime: appointments.startTime,
        doctor: users.fullName,
        branch: branches.name,
      })
      .from(appointments)
      .innerJoin(users, eq(users.id, appointments.doctorId))
      .innerJoin(branches, eq(branches.id, appointments.branchId))
      .where(
        and(
          eq(appointments.patientId, ctx.patientId),
          inArray(appointments.status, ['scheduled', 'confirmed']),
          gt(appointments.startTime, nowDate()),
        ),
      )
      .orderBy(asc(appointments.startTime), asc(appointments.id))
      .limit(MAX_LISTED + 1);
    if (rows.length === 0) return { text: m.myAppointmentsEmpty };
    const shown = rows.slice(0, MAX_LISTED);
    const lines = shown.map((r) => `• ${fmtWhen(r.startTime)} — ${r.doctor}, ${r.branch}`);
    if (rows.length > MAX_LISTED) lines.push(m.myAppointmentsMore(rows.length - MAX_LISTED));
    return {
      text: `${m.myAppointmentsTitle}\n${lines.join('\n')}`,
      buttons: shown.map((r) => [
        {
          text: m.cancelAppointmentButton(fmtWhen(r.startTime)),
          data: reminderCallbackData('no', r.id),
        },
      ]),
    };
  }

  /** Umumiy balans — faqat summa (qarz / avans / nol). */
  async function balance(ctx: SelfServiceCtx): Promise<BotReply> {
    const m = botMessages(ctx.lang);
    if (!deps.patients) return { text: m.balanceZero };
    const c = createBotContext(ctx.tx, ctx.tenantId);
    const { balance: b } = await deps.patients.balanceFor(c, ctx.patientId);
    if (b > 0) return { text: m.balanceDebt(fmtMoney(b, ctx.lang)) };
    if (b < 0) return { text: m.balanceCredit(fmtMoney(-b, ctx.lang)) };
    return { text: m.balanceZero };
  }

  return { myAppointments, balance };
}
