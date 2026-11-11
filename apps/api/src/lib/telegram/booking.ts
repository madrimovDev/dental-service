import { bookingRequests, branches } from '@dental/db-schema';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.ts';
import type { AppointmentsService } from '../../modules/appointments/index.ts';
import type { ScheduleService } from '../../modules/schedule/index.ts';
import { CLINIC_TZ } from '../sms-templates.ts';
import { createBotContext } from './bot-context.ts';
import { type BotLang, botMessages, fmtWhen } from './messages.ts';
import type { BotButton, BotReply } from './reply.ts';

/** Bot orqali bron qilinadigan slot davomiyligi (daqiqa) — confirm ham shuni ishlatadi. */
export const BOOKING_SLOT_MINUTES = 30;
export const BOOKING_DAYS_AHEAD = 7;
const SESSION_TTL_MS = 30 * 60_000;
const MAX_SLOT_BUTTONS = 12;

type Step = 'branch' | 'doctor' | 'day' | 'slot';
type Slot = { start: string; doctorId: string };

export type BookingSession = {
  patientId: string;
  rescheduleOf: string | null;
  step: Step;
  branches: { id: string; name: string }[];
  doctors: { id: string; name: string }[];
  days: string[];
  slots: Slot[];
  branchId?: string;
  doctorId?: string | null;
  date?: string;
  expiresAt: number;
};

export type BookingDeps = {
  schedule: Pick<ScheduleService, 'getAvailability'>;
  appointments: Pick<AppointmentsService, 'listDoctors'>;
  sessions?: Map<string, BookingSession>;
  now?: () => Date;
};

export const BOOKING_PREFIX = 'bk';

const localDate = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/** 'YYYY-MM-DD' + n kun (UTC-anchor — kalendar arifmetikasi, DST yo'q). */
const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const ddmm = (date: string): string => `${date.slice(8, 10)}.${date.slice(5, 7)}`;

const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

export type BookingCtx = {
  tx: DbOrTx;
  tenantId: string;
  chatId: string;
  patientId: string;
  lang: BotLang;
};

export function createBookingFlow(deps: BookingDeps) {
  const sessions = deps.sessions ?? new Map<string, BookingSession>();
  const now = () => deps.now?.() ?? new Date();
  const key = (ctx: { tenantId: string; chatId: string }) => `${ctx.tenantId}:${ctx.chatId}`;

  const cancelRow = (m: ReturnType<typeof botMessages>): BotButton[] => [
    { text: m.cancelFlow, data: `${BOOKING_PREFIX}:x` },
  ];
  const navRow = (m: ReturnType<typeof botMessages>): BotButton[] => [
    { text: m.back, data: `${BOOKING_PREFIX}:bk` },
    { text: m.cancelFlow, data: `${BOOKING_PREFIX}:x` },
  ];

  async function renderDoctors(ctx: BookingCtx, s: BookingSession): Promise<BotReply> {
    const m = botMessages(ctx.lang);
    const c = createBotContext(ctx.tx, ctx.tenantId);
    s.doctors = await deps.appointments.listDoctors(c);
    s.step = 'doctor';
    const rows = chunk<BotButton>(
      s.doctors.map((d, i) => ({ text: d.name, data: `${BOOKING_PREFIX}:d:${i}` })),
      2,
    );
    rows.push([{ text: m.anyDoctor, data: `${BOOKING_PREFIX}:d:a` }]);
    rows.push(s.branches.length > 1 ? navRow(m) : cancelRow(m));
    return { text: m.chooseDoctor, buttons: rows };
  }

  function renderDays(ctx: BookingCtx, s: BookingSession): BotReply {
    const m = botMessages(ctx.lang);
    const today = localDate(now());
    s.days = Array.from({ length: BOOKING_DAYS_AHEAD }, (_, i) => addDays(today, i));
    s.step = 'day';
    const rows = chunk<BotButton>(
      s.days.map((d, i) => ({ text: ddmm(d), data: `${BOOKING_PREFIX}:t:${i}` })),
      4,
    );
    rows.push(navRow(m));
    return { text: m.chooseDay, buttons: rows };
  }

  async function renderSlots(ctx: BookingCtx, s: BookingSession): Promise<BotReply> {
    const m = botMessages(ctx.lang);
    if (!s.branchId || !s.date) return { text: m.sessionExpired };
    const c = createBotContext(ctx.tx, ctx.tenantId);
    const doctorIds = s.doctorId ? [s.doctorId] : s.doctors.map((d) => d.id);
    const byStart = new Map<string, Slot>();
    for (const doctorId of doctorIds) {
      const av = await deps.schedule.getAvailability(
        c,
        { doctorId, branchId: s.branchId, date: s.date, slotMinutes: BOOKING_SLOT_MINUTES },
        now(),
      );
      for (const sl of av.slots)
        if (!byStart.has(sl.start)) byStart.set(sl.start, { start: sl.start, doctorId });
    }
    s.slots = [...byStart.values()]
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, MAX_SLOT_BUTTONS);
    s.step = 'slot';
    if (s.slots.length === 0) {
      return { text: m.noSlots, buttons: [navRow(m)] };
    }
    const rows = chunk<BotButton>(
      s.slots.map((sl, i) => ({
        text: fmtWhen(new Date(sl.start)).slice(-5),
        data: `${BOOKING_PREFIX}:s:${i}`,
      })),
      4,
    );
    rows.push(navRow(m));
    return { text: m.chooseSlot, buttons: rows };
  }

  async function afterBranch(ctx: BookingCtx, s: BookingSession): Promise<BotReply> {
    return renderDoctors(ctx, s);
  }

  /** Oqimni boshlaydi (menyu «Yozilish» yoki eslatmadagi «Boshqa vaqt»). */
  async function start(
    ctx: BookingCtx,
    opts: { rescheduleOf?: string | null } = {},
  ): Promise<BotReply> {
    const m = botMessages(ctx.lang);
    const [pending] = await ctx.tx
      .select({ id: bookingRequests.id })
      .from(bookingRequests)
      .where(
        and(eq(bookingRequests.patientId, ctx.patientId), eq(bookingRequests.status, 'pending')),
      )
      .limit(1);
    if (pending) return { text: m.alreadyPending };

    const brs = await ctx.tx
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(isNull(branches.deletedAt))
      .orderBy(asc(branches.name));
    if (brs.length === 0) return { text: m.noBranches };

    const s: BookingSession = {
      patientId: ctx.patientId,
      rescheduleOf: opts.rescheduleOf ?? null,
      step: 'branch',
      branches: brs,
      doctors: [],
      days: [],
      slots: [],
      expiresAt: now().getTime() + SESSION_TTL_MS,
    };
    sessions.set(key(ctx), s);

    if (brs.length === 1) {
      s.branchId = brs[0]?.id;
      return afterBranch(ctx, s);
    }
    const rows = chunk<BotButton>(
      brs.map((b, i) => ({ text: b.name, data: `${BOOKING_PREFIX}:b:${i}` })),
      2,
    );
    rows.push(cancelRow(m));
    return { text: m.chooseBranch, buttons: rows };
  }

  /** `bk:*` callback. */
  async function handle(ctx: BookingCtx, data: string): Promise<BotReply> {
    const m = botMessages(ctx.lang);
    const k = key(ctx);
    const s = sessions.get(k);
    if (data === `${BOOKING_PREFIX}:x`) {
      sessions.delete(k);
      return { text: m.flowCancelled };
    }
    // Sessiya chat egasiniki (kalit = tenant+chat_id; bemor `start`da chat bo'yicha
    // tekshirilgan) — boshqa chat sessiyasiga tegib bo'lmaydi.
    if (!s || s.expiresAt < now().getTime()) {
      sessions.delete(k);
      return { text: m.sessionExpired };
    }
    const [, op, arg] = data.split(':');

    if (op === 'bk') {
      if (s.step === 'slot') return renderDays(ctx, s);
      if (s.step === 'day') return renderDoctors(ctx, s);
      // doctor → branch
      s.step = 'branch';
      const rows = chunk<BotButton>(
        s.branches.map((b, i) => ({ text: b.name, data: `${BOOKING_PREFIX}:b:${i}` })),
        2,
      );
      rows.push(cancelRow(m));
      return { text: m.chooseBranch, buttons: rows };
    }
    if (op === 'b') {
      const b = s.branches[Number(arg)];
      if (!b) return { text: m.sessionExpired };
      s.branchId = b.id;
      return afterBranch(ctx, s);
    }
    if (op === 'd') {
      if (arg === 'a') s.doctorId = null;
      else {
        const d = s.doctors[Number(arg)];
        if (!d) return { text: m.sessionExpired };
        s.doctorId = d.id;
      }
      return renderDays(ctx, s);
    }
    if (op === 't') {
      const day = s.days[Number(arg)];
      if (!day) return { text: m.sessionExpired };
      s.date = day;
      return renderSlots(ctx, s);
    }
    if (op === 's') {
      const slot = s.slots[Number(arg)];
      if (!slot || !s.branchId) return { text: m.sessionExpired };
      const start = new Date(slot.start);
      await ctx.tx.insert(bookingRequests).values({
        tenantId: ctx.tenantId,
        branchId: s.branchId,
        patientId: s.patientId,
        doctorId: slot.doctorId,
        requestedStart: start,
        rescheduleOfAppointmentId: s.rescheduleOf,
      });
      sessions.delete(k);
      return { text: (s.rescheduleOf ? m.rescheduleSent : m.requestSent)(fmtWhen(start)) };
    }
    return { text: m.sessionExpired };
  }

  return { start, handle, sessions };
}

export type BookingFlow = ReturnType<typeof createBookingFlow>;
