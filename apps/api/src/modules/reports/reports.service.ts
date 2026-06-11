import {
  appointments,
  branches,
  cashierTransactionItems,
  cashierTransactions,
  treatmentPlans,
  treatmentStages,
} from '@dental/db-schema';
import { and, between, count, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import {
  branchOpenMinutes,
  completionRate,
  DEFAULT_WORK_MINUTES,
  noShowRate,
  utilizationPct,
} from './reports.aggregations.ts';
import type {
  AppointmentStatsReport,
  DoctorWorkloadRow,
  PlanCompletionReport,
  ReportRange,
  RevenueReport,
} from './reports.schema.ts';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const tashkentRange = (from: string, to: string) => ({
  start: new Date(`${from}T00:00:00+05:00`),
  end: new Date(`${to}T23:59:59.999+05:00`),
});

/** Har kun (from..to) uchun 'sun'..'sat' kaliti — Tashkent kuni, noon-anchored (TZ chegarasi xavfsiz). */
function* eachWeekday(from: string, to: string): Generator<string> {
  const cur = new Date(`${from}T12:00:00+05:00`);
  const last = new Date(`${to}T12:00:00+05:00`);
  while (cur.getTime() <= last.getTime()) {
    yield WEEKDAYS[cur.getUTCDay()] as string;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

export const createReportsService = () => {
  async function revenue(c: Context, { from, to, branchId }: ReportRange): Promise<RevenueReport> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const signed = sql<string>`COALESCE(SUM(CASE WHEN ${cashierTransactions.type} = 'refund' THEN -${cashierTransactions.paidAmount} ELSE ${cashierTransactions.paidAmount} END), 0)`;

    const base = [
      eq(cashierTransactions.status, 'completed'),
      between(cashierTransactions.createdAt, start, end),
    ];
    if (branchId) base.push(eq(cashierTransactions.branchId, branchId));

    const dayExpr = sql<string>`(${cashierTransactions.createdAt} AT TIME ZONE 'Asia/Tashkent')::date`;

    const [totalRow] = await db
      .select({ total: signed })
      .from(cashierTransactions)
      .where(and(...base));

    const byBranch = await db
      .select({ branchId: cashierTransactions.branchId, total: signed })
      .from(cashierTransactions)
      .where(and(...base))
      .groupBy(cashierTransactions.branchId);

    const byPeriod = await db
      .select({ date: dayExpr, total: signed })
      .from(cashierTransactions)
      .where(and(...base))
      .groupBy(dayExpr);

    // byService — itemli POS (payment, completed)
    const itemBase = [
      eq(cashierTransactions.status, 'completed'),
      eq(cashierTransactions.type, 'payment'),
      between(cashierTransactions.createdAt, start, end),
    ];
    if (branchId) itemBase.push(eq(cashierTransactions.branchId, branchId));
    const byService = await db
      .select({
        serviceName: cashierTransactionItems.serviceName,
        total: sql<string>`COALESCE(SUM(${cashierTransactionItems.subtotal}), 0)`,
      })
      .from(cashierTransactionItems)
      .innerJoin(
        cashierTransactions,
        eq(cashierTransactionItems.transactionId, cashierTransactions.id),
      )
      .where(and(...itemBase))
      .groupBy(cashierTransactionItems.serviceName);

    // byDoctor — plan-linked (treatment_plans.doctorId), plansiz → null
    const byDoctorPlan = await db
      .select({ doctorId: treatmentPlans.doctorId, total: signed })
      .from(cashierTransactions)
      .innerJoin(treatmentPlans, eq(cashierTransactions.treatmentPlanId, treatmentPlans.id))
      .where(and(...base))
      .groupBy(treatmentPlans.doctorId);
    const [unassigned] = await db
      .select({ total: signed })
      .from(cashierTransactions)
      .where(and(...base, isNull(cashierTransactions.treatmentPlanId)));

    const byDoctor: RevenueReport['byDoctor'] = byDoctorPlan.map((r) => ({
      doctorId: r.doctorId,
      total: Number(r.total),
    }));
    const unassignedTotal = Number(unassigned?.total ?? 0);
    if (unassignedTotal !== 0) byDoctor.push({ doctorId: null, total: unassignedTotal });

    return {
      total: Number(totalRow?.total ?? 0),
      byBranch: byBranch.map((r) => ({ branchId: r.branchId, total: Number(r.total) })),
      byService: byService.map((r) => ({ serviceName: r.serviceName, total: Number(r.total) })),
      byDoctor,
      byPeriod: byPeriod.map((r) => ({ date: String(r.date), total: Number(r.total) })),
    };
  }

  async function appointmentStats(
    c: Context,
    { from, to, branchId }: ReportRange,
  ): Promise<AppointmentStatsReport> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const base = [between(appointments.startTime, start, end)];
    if (branchId) base.push(eq(appointments.branchId, branchId));

    const statusRows = await db
      .select({ status: appointments.status, c: count() })
      .from(appointments)
      .where(and(...base))
      .groupBy(appointments.status);
    const byStatus = statusRows.map((r) => ({ status: r.status as string, count: Number(r.c) }));
    const total = byStatus.reduce((s, r) => s + r.count, 0);
    const noShow = byStatus.find((r) => r.status === 'no_show')?.count ?? 0;

    const [bookedRow] = await db
      .select({
        minutes: sql<string>`COALESCE(SUM(EXTRACT(EPOCH FROM (${appointments.endTime} - ${appointments.startTime})) / 60), 0)`,
      })
      .from(appointments)
      .where(and(...base, ne(appointments.status, 'cancelled')));
    const bookedMinutes = Number(bookedRow?.minutes ?? 0);

    // capacity: har branch uchun distinct doktor × kunlik ish-daqiqa
    const docRows = await db
      .select({
        branchId: appointments.branchId,
        docs: sql<number>`COUNT(DISTINCT ${appointments.doctorId})`,
      })
      .from(appointments)
      .where(and(...base))
      .groupBy(appointments.branchId);

    const branchRows = await db
      .select({ id: branches.id, workHours: branches.workHours })
      .from(branches)
      .where(branchId ? eq(branches.id, branchId) : undefined);
    const whById = new Map(branchRows.map((b) => [b.id, b.workHours]));

    let capacityMinutes = 0;
    for (const dr of docRows) {
      const wh = whById.get(dr.branchId) ?? null;
      for (const weekday of eachWeekday(from, to)) {
        capacityMinutes += branchOpenMinutes(wh, weekday, DEFAULT_WORK_MINUTES) * Number(dr.docs);
      }
    }

    return {
      total,
      byStatus,
      noShowRate: noShowRate(noShow, total),
      slotUtilization: utilizationPct(bookedMinutes, capacityMinutes),
    };
  }

  async function doctorWorkload(
    c: Context,
    { from, to, branchId }: ReportRange,
  ): Promise<DoctorWorkloadRow[]> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const base = [between(appointments.startTime, start, end)];
    if (branchId) base.push(eq(appointments.branchId, branchId));

    const rows = await db
      .select({
        doctorId: appointments.doctorId,
        total: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE ${appointments.status} = 'completed')`,
      })
      .from(appointments)
      .where(and(...base))
      .groupBy(appointments.doctorId);

    return rows.map((r) => ({
      doctorId: r.doctorId,
      total: Number(r.total),
      completed: Number(r.completed),
    }));
  }

  async function planCompletion(
    c: Context,
    { from, to }: ReportRange,
  ): Promise<PlanCompletionReport> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    // Reja created_at oraliqda; status accepted/in_progress/completed. (branchId — rejada filial yo'q, e'tiborga olinmaydi.)
    const rows = await db
      .select({ status: treatmentStages.status, c: count() })
      .from(treatmentStages)
      .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
      .where(
        and(
          sql`${treatmentPlans.status} IN ('accepted','in_progress','completed')`,
          between(treatmentPlans.createdAt, start, end),
        ),
      )
      .groupBy(treatmentStages.status);

    const byStatus = rows.map((r) => ({ status: r.status as string, count: Number(r.c) }));
    const totalStages = byStatus.reduce((s, r) => s + r.count, 0);
    const completedStages = byStatus.find((r) => r.status === 'completed')?.count ?? 0;

    return {
      totalStages,
      completedStages,
      rate: completionRate(completedStages, totalStages),
      byStatus,
    };
  }

  return { revenue, appointmentStats, doctorWorkload, planCompletion };
};

export type ReportsService = ReturnType<typeof createReportsService>;
