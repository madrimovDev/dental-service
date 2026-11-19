import {
  appointments,
  branches,
  prescriptions,
  tenantSettings,
  treatmentPlans,
  treatmentStages,
  users,
} from '@dental/db-schema';
import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import type { PatientsService } from '../../modules/patients/patients.service.ts';
import type { AuditLogger } from '../audit-logger.ts';
import { createBotContext } from './bot-context.ts';
import { type BotLang, botMessages, fmtMoney, fmtWhen } from './messages.ts';
import { reminderCallbackData } from './reminder-actions.ts';
import type { BotReply } from './reply.ts';

/** Bitta xabarda ko'rsatiladigan eng ko'p yozilish (Telegram tugma/matn chegarasi). */
const MAX_LISTED = 10;

/** FT-07.3: bitta chat uchun daqiqasiga eng ko'p so'rov (sliding window). */
export const SELF_SERVICE_LIMIT_PER_MIN = 20;
const WINDOW_MS = 60_000;
/** Xotira chegarasi: shuncha chat kuzatilsa, eskirgan yozuvlar tozalanadi. */
const PRUNE_AT = 2000;

export type SelfServiceRequest = 'appointments' | 'balance' | 'plan' | 'prescription';

export type SelfServiceCtx = {
  tx: DbOrTx;
  tenantId: string;
  /** Throttling/audit uchun Telegram chat. */
  chatId: string;
  patientId: string;
  lang: BotLang;
};

export type SelfServiceDeps = {
  patients?: Pick<PatientsService, 'balanceFor'>;
  /** FT-07.3: har so'rov `audit_log`ga (`user_id=null`, `after.actor='telegram'`). */
  audit?: Pick<AuditLogger, 'record'>;
  now?: () => Date;
};

/**
 * FT-07 — bemorning O'Z ma'lumotlarini ko'rishi (faqat bog'langan chat'ning faol bemori).
 * Faqat yozilish vaqti/doktor/filial va balans SUMMASI — tibbiy yozuv/rasm/odontogramma yo'q.
 */
export function createSelfServiceFlow(deps: SelfServiceDeps) {
  const nowDate = () => deps.now?.() ?? new Date();

  // `tenantId:chatId` → so'nggi 60 soniyadagi so'rov vaqtlari (jarayon xotirasida; bot bitta jarayonda).
  const hits = new Map<string, number[]>();

  /** `true` — ruxsat (so'rov hisobga olindi); `false` — limit oshgan. */
  function allow(key: string): boolean {
    const t = nowDate().getTime();
    if (hits.size >= PRUNE_AT) {
      for (const [k, v] of hits) if (v.every((x) => t - x >= WINDOW_MS)) hits.delete(k);
    }
    const recent = (hits.get(key) ?? []).filter((x) => t - x < WINDOW_MS);
    if (recent.length >= SELF_SERVICE_LIMIT_PER_MIN) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    return true;
  }

  /**
   * Barcha o'z-o'ziga xizmat so'rovlarining umumiy darvozasi: throttling → tenant sozlamasi
   * (`bot_self_service_enabled`, standart true) → audit (faqat ko'rilgani, tarkibi emas).
   */
  async function guarded(
    ctx: SelfServiceCtx,
    request: SelfServiceRequest,
    run: (ctx: SelfServiceCtx) => Promise<BotReply>,
  ): Promise<BotReply> {
    const m = botMessages(ctx.lang);
    if (!allow(`${ctx.tenantId}:${ctx.chatId}`)) return { text: m.throttled };
    const [s] = await ctx.tx
      .select({ enabled: tenantSettings.botSelfServiceEnabled })
      .from(tenantSettings)
      .limit(1);
    if (s && !s.enabled) return { text: m.selfServiceDisabled };
    await deps.audit?.record(createBotContext(ctx.tx, ctx.tenantId), {
      action: 'viewed',
      resourceType: 'bot_self_service',
      resourceId: ctx.patientId,
      after: { actor: 'telegram', request, patientId: ctx.patientId, chatId: ctx.chatId },
    });
    return run(ctx);
  }

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

  /**
   * Eng so'nggi FAOL reja (taqdim etilgan/qabul qilingan/jarayonda): nomi, bosqichlar
   * nomi+holati, umumiy summa. Qoralama va bekor/yakunlangan rejalar ko'rsatilmaydi;
   * bosqich narxi/izohi/odontogramma yo'q.
   */
  async function myPlan(ctx: SelfServiceCtx): Promise<BotReply> {
    const m = botMessages(ctx.lang);
    const [plan] = await ctx.tx
      .select({
        id: treatmentPlans.id,
        title: treatmentPlans.title,
        total: treatmentPlans.totalCost,
      })
      .from(treatmentPlans)
      .where(
        and(
          eq(treatmentPlans.patientId, ctx.patientId),
          inArray(treatmentPlans.status, ['presented', 'accepted', 'in_progress']),
        ),
      )
      .orderBy(desc(treatmentPlans.createdAt), desc(treatmentPlans.id))
      .limit(1);
    if (!plan) return { text: m.planEmpty };
    const stages = await ctx.tx
      .select({ name: treatmentStages.serviceName, status: treatmentStages.status })
      .from(treatmentStages)
      .where(eq(treatmentStages.treatmentPlanId, plan.id))
      .orderBy(asc(treatmentStages.sequence));
    const lines = [m.planTitle(plan.title), ...stages.map((s) => m.planStage(s))];
    lines.push(m.planTotal(fmtMoney(plan.total, ctx.lang)));
    return { text: lines.join('\n') };
  }

  /** Eng oxirgi retsept (mavjud xabar shabloni qayta ishlatiladi). */
  async function lastPrescription(ctx: SelfServiceCtx): Promise<BotReply> {
    const m = botMessages(ctx.lang);
    const [rx] = await ctx.tx
      .select({ issuedDate: prescriptions.issuedDate, items: prescriptions.items })
      .from(prescriptions)
      .where(eq(prescriptions.patientId, ctx.patientId))
      .orderBy(desc(prescriptions.issuedDate), desc(prescriptions.id))
      .limit(1);
    if (!rx || rx.items.length === 0) return { text: m.prescriptionEmpty };
    return {
      text: m.prescription({
        when: fmtWhen(rx.issuedDate),
        items: rx.items.map((i) => ({
          name: i.medicationName,
          dosage: i.dosage,
          frequency: i.frequency,
          days: i.durationDays,
        })),
      }),
    };
  }

  return {
    myAppointments: (ctx: SelfServiceCtx) => guarded(ctx, 'appointments', myAppointments),
    balance: (ctx: SelfServiceCtx) => guarded(ctx, 'balance', balance),
    myPlan: (ctx: SelfServiceCtx) => guarded(ctx, 'plan', myPlan),
    lastPrescription: (ctx: SelfServiceCtx) => guarded(ctx, 'prescription', lastPrescription),
  };
}
