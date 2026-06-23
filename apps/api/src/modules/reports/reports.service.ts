import {
  appointments,
  branches,
  cashierTransactionItems,
  cashierTransactions,
  patients,
  recalls,
  treatmentPlans,
  treatmentStages,
} from '@dental/db-schema';
import { and, between, count, countDistinct, desc, eq, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import {
  branchOpenMinutes,
  comparisonEntry,
  completionRate,
  DEFAULT_WORK_MINUTES,
  noShowRate,
  periodLengthDays,
  recallEfficacy,
  retentionRate,
  shiftDays,
  shiftYears,
  utilizationPct,
} from './reports.aggregations.ts';
import type {
  AppointmentStatsReport,
  DentalAnalyticsReport,
  DoctorWorkloadRow,
  OneCExportRow,
  PlanCompletionReport,
  ReportRange,
  RevenueReport,
} from './reports.schema.ts';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Refund → manfiy, to'lov → musbat yig'indisi (COALESCE 0 agar hech narsa yo'q). */
const signedPaidAmount = sql<string>`COALESCE(SUM(CASE WHEN ${cashierTransactions.type} = 'refund' THEN -${cashierTransactions.paidAmount} ELSE ${cashierTransactions.paidAmount} END), 0)`;

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
  async function revenueTotal(c: Context, { from, to, branchId }: ReportRange): Promise<number> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const base = [
      eq(cashierTransactions.status, 'completed'),
      between(cashierTransactions.createdAt, start, end),
    ];
    if (branchId) base.push(eq(cashierTransactions.branchId, branchId));
    const [row] = await db
      .select({ total: signedPaidAmount })
      .from(cashierTransactions)
      .where(and(...base));
    return Number(row?.total ?? 0);
  }

  async function appointmentCount(
    c: Context,
    { from, to, branchId }: ReportRange,
  ): Promise<number> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const base = [between(appointments.startTime, start, end)];
    if (branchId) base.push(eq(appointments.branchId, branchId));
    const [row] = await db
      .select({ c: count() })
      .from(appointments)
      .where(and(...base));
    return Number(row?.c ?? 0);
  }

  /** Joriy oraliq uchun previous + yoy taqqoslash (umumiy). */
  async function buildComparison(
    c: Context,
    range: ReportRange,
    current: number,
    totalFn: (c: Context, r: ReportRange) => Promise<number>,
  ) {
    const len = periodLengthDays(range.from, range.to);
    const prevTo = shiftDays(range.from, -1);
    const prevFrom = shiftDays(prevTo, -(len - 1));
    const prevRange = { from: prevFrom, to: prevTo, branchId: range.branchId };
    const yoyRange = {
      from: shiftYears(range.from, -1),
      to: shiftYears(range.to, -1),
      branchId: range.branchId,
    };
    const [prev, yoy] = await Promise.all([totalFn(c, prevRange), totalFn(c, yoyRange)]);
    return { previous: comparisonEntry(current, prev), yoy: comparisonEntry(current, yoy) };
  }

  async function revenue(c: Context, { from, to, branchId }: ReportRange): Promise<RevenueReport> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);

    const base = [
      eq(cashierTransactions.status, 'completed'),
      between(cashierTransactions.createdAt, start, end),
    ];
    if (branchId) base.push(eq(cashierTransactions.branchId, branchId));

    const dayExpr = sql<string>`(${cashierTransactions.createdAt} AT TIME ZONE 'Asia/Tashkent')::date`;

    const [totalRow] = await db
      .select({ total: signedPaidAmount })
      .from(cashierTransactions)
      .where(and(...base));

    const byBranch = await db
      .select({ branchId: cashierTransactions.branchId, total: signedPaidAmount })
      .from(cashierTransactions)
      .where(and(...base))
      .groupBy(cashierTransactions.branchId);

    const byPeriod = await db
      .select({ date: dayExpr, total: signedPaidAmount })
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
      .select({ doctorId: treatmentPlans.doctorId, total: signedPaidAmount })
      .from(cashierTransactions)
      .innerJoin(treatmentPlans, eq(cashierTransactions.treatmentPlanId, treatmentPlans.id))
      .where(and(...base))
      .groupBy(treatmentPlans.doctorId);
    const [unassigned] = await db
      .select({ total: signedPaidAmount })
      .from(cashierTransactions)
      .where(and(...base, isNull(cashierTransactions.treatmentPlanId)));

    const byDoctor: RevenueReport['byDoctor'] = byDoctorPlan.map((r) => ({
      doctorId: r.doctorId,
      total: Number(r.total),
    }));
    const unassignedTotal = Number(unassigned?.total ?? 0);
    if (unassignedTotal !== 0) byDoctor.push({ doctorId: null, total: unassignedTotal });

    const currentTotal = Number(totalRow?.total ?? 0);
    const comparison = await buildComparison(c, { from, to, branchId }, currentTotal, revenueTotal);

    return {
      total: currentTotal,
      byBranch: byBranch.map((r) => ({ branchId: r.branchId, total: Number(r.total) })),
      byService: byService.map((r) => ({ serviceName: r.serviceName, total: Number(r.total) })),
      byDoctor,
      byPeriod: byPeriod.map((r) => ({ date: String(r.date), total: Number(r.total) })),
      comparison,
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

    const comparison = await buildComparison(c, { from, to, branchId }, total, appointmentCount);

    return {
      total,
      byStatus,
      noShowRate: noShowRate(noShow, total),
      slotUtilization: utilizationPct(bookedMinutes, capacityMinutes),
      comparison,
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
    // Reja created_at oraliqda; status accepted/in_progress/completed.
    // branchId ataylab e'tiborga olinmaydi: treatment_plans tenant-level by-design (Qaror #29,
    // docs/architecture.md §5.1) — reja branch-scoped emas, shuning uchun plan-completion tenant-wide.
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

  async function dentalAnalytics(
    c: Context,
    { from, to, branchId }: ReportRange,
  ): Promise<DentalAnalyticsReport> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);

    // 1. Procedure-mix — kassa item'lari (completed payment, oraliq, filial).
    const txFilter = [
      between(cashierTransactions.createdAt, start, end),
      eq(cashierTransactions.type, 'payment'),
      eq(cashierTransactions.status, 'completed'),
    ];
    if (branchId) txFilter.push(eq(cashierTransactions.branchId, branchId));
    const mixRows = await db
      .select({
        serviceName: cashierTransactionItems.serviceName,
        count: sql<string>`SUM(${cashierTransactionItems.quantity})`,
        revenue: sql<string>`SUM(${cashierTransactionItems.subtotal})`,
      })
      .from(cashierTransactionItems)
      .innerJoin(
        cashierTransactions,
        eq(cashierTransactionItems.transactionId, cashierTransactions.id),
      )
      .where(and(...txFilter))
      .groupBy(cashierTransactionItems.serviceName)
      .orderBy(desc(sql`SUM(${cashierTransactionItems.subtotal})`));

    // 2. Retention — yangi (oraliqda yaratilgan) vs qaytgan (oraliqda yozilgan, lekin
    //    oraliqdan oldin yaratilgan bemor). Retention bemor-darajasida (tenant-wide, Qaror #29).
    const [newRow] = await db
      .select({ c: count() })
      .from(patients)
      .where(between(patients.createdAt, start, end));
    const apptRetFilter = [
      between(appointments.startTime, start, end),
      lt(patients.createdAt, start),
    ];
    if (branchId) apptRetFilter.push(eq(appointments.branchId, branchId));
    const [retRow] = await db
      .select({ c: countDistinct(appointments.patientId) })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .where(and(...apptRetFilter));
    const newPatients = Number(newRow?.c ?? 0);
    const returningPatients = Number(retRow?.c ?? 0);

    // 3. Recall-efficacy — oraliqda yaratilgan recall'lar, status bo'yicha.
    const recallRows = await db
      .select({ status: recalls.status, c: count() })
      .from(recalls)
      .where(between(recalls.createdAt, start, end))
      .groupBy(recalls.status);
    const recallByStatus = recallRows.map((r) => ({
      status: r.status as string,
      count: Number(r.c),
    }));
    const recallTotal = recallByStatus.reduce((s, r) => s + r.count, 0);
    const recallConverted = recallByStatus
      .filter((r) => r.status === 'scheduled' || r.status === 'completed')
      .reduce((s, r) => s + r.count, 0);

    // 4. No-show trend — hafta-kuni bo'yicha (Asia/Tashkent). EXTRACT(DOW) 0=Yak..6=Shan.
    const nsFilter = [between(appointments.startTime, start, end)];
    if (branchId) nsFilter.push(eq(appointments.branchId, branchId));
    const nsRows = await db
      .select({
        weekday: sql<number>`EXTRACT(DOW FROM ${appointments.startTime} AT TIME ZONE 'Asia/Tashkent')::int`,
        total: count(),
        noShow: sql<number>`COUNT(*) FILTER (WHERE ${appointments.status} = 'no_show')`,
      })
      .from(appointments)
      .where(and(...nsFilter))
      .groupBy(sql`EXTRACT(DOW FROM ${appointments.startTime} AT TIME ZONE 'Asia/Tashkent')`);

    return {
      procedureMix: mixRows.map((r) => ({
        serviceName: r.serviceName,
        count: Number(r.count),
        revenue: Number(r.revenue),
      })),
      retention: {
        newPatients,
        returningPatients,
        retentionRate: retentionRate(returningPatients, newPatients),
      },
      recallEfficacy: {
        total: recallTotal,
        converted: recallConverted,
        efficacy: recallEfficacy(recallConverted, recallTotal),
        byStatus: recallByStatus,
      },
      noShowByWeekday: nsRows
        .map((r) => ({
          weekday: Number(r.weekday),
          total: Number(r.total),
          noShow: Number(r.noShow),
          rate: noShowRate(Number(r.noShow), Number(r.total)),
        }))
        .sort((a, b) => a.weekday - b.weekday),
    };
  }

  /** 1C buxgalteriya eksporti — tranzaksiya-darajali (completed) qatorlar. */
  async function oneCExport(
    c: Context,
    { from, to, branchId }: ReportRange,
  ): Promise<OneCExportRow[]> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const filter = [
      eq(cashierTransactions.status, 'completed'),
      between(cashierTransactions.createdAt, start, end),
    ];
    if (branchId) filter.push(eq(cashierTransactions.branchId, branchId));

    const rows = await db
      .select({
        date: sql<string>`(${cashierTransactions.createdAt} AT TIME ZONE 'Asia/Tashkent')::date`,
        receiptNumber: cashierTransactions.receiptNumber,
        type: cashierTransactions.type,
        paymentMethod: cashierTransactions.paymentMethod,
        amount: cashierTransactions.paidAmount,
        patientName: patients.fullName,
      })
      .from(cashierTransactions)
      .leftJoin(patients, eq(cashierTransactions.patientId, patients.id))
      .where(and(...filter))
      .orderBy(cashierTransactions.createdAt);

    return rows.map((r) => ({
      date: String(r.date),
      receiptNumber: r.receiptNumber ?? null,
      type: r.type,
      paymentMethod: r.paymentMethod,
      // refund manfiy summa sifatida (buxgalteriya konvensiyasi).
      amount: r.type === 'refund' ? -Number(r.amount) : Number(r.amount),
      patientName: r.patientName ?? null,
    }));
  }

  return {
    revenue,
    appointmentStats,
    doctorWorkload,
    planCompletion,
    dentalAnalytics,
    oneCExport,
  };
};

export type ReportsService = ReturnType<typeof createReportsService>;
