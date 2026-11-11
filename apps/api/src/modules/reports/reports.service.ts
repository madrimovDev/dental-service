import {
  appointments,
  branches,
  cashierTransactions,
  expenses,
  patients,
  payrollLines,
  payrollRuns,
  recalls,
  serviceMaterials,
  stockBatches,
  treatmentPlans,
  treatmentStagePayments,
  treatmentStages,
} from '@dental/db-schema';
import type { Column } from 'drizzle-orm';
import {
  and,
  between,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
} from 'drizzle-orm';
import type { Context } from 'hono';
import type { DbOrTx } from '../../db/client.ts';
import { getDb } from '../../db/scoped.ts';
import type { AuditLogger } from '../../lib/audit-logger.ts';
import type { NonPlanTransactionRow } from '../patients/patients.balance.ts';
import { computeNonPlanRemainder, computePatientBalance } from '../patients/patients.balance.ts';
import {
  branchOpenMinutes,
  comparisonEntry,
  completionRate,
  computeServiceMargin,
  DEFAULT_WORK_MINUTES,
  materialCostByService,
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
  DebtAgingReport,
  DentalAnalyticsReport,
  DoctorWorkloadRow,
  OneCExportRow,
  OwnerTodayReport,
  PlanCompletionReport,
  PnlReport,
  ReportRange,
  RevenueReport,
} from './reports.schema.ts';
import { debtAgingBucketKeys } from './reports.schema.ts';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Refund → manfiy, to'lov → musbat yig'indisi (COALESCE 0 agar hech narsa yo'q). */
const signedPaidAmount = sql<string>`COALESCE(SUM(CASE WHEN ${cashierTransactions.type} = 'refund' THEN -${cashierTransactions.paidAmount} ELSE ${cashierTransactions.paidAmount} END), 0)`;

/**
 * Asia/Tashkent (UTC+5, DST yo'q) kun oralig'i — YARIM-OCHIQ (CLI-442 #1).
 * `start` inklyuziv (from kunining 00:00), `end` EKSKLYUZIV (to kunidan keyingi kun 00:00).
 * `between(...)` (inklyuziv `…23:59:59.999`) sub-ms tranzaksiyalarni (masalan `23:59:59.9995`)
 * tushirib qoldirardi — yarim-ochiq `>= start AND < end` teshikni yopadi va kun chegarasi
 * hech qanday tranzaksiyani ikki kunda hisoblamaydi.
 */
const tashkentRange = (from: string, to: string) => {
  const start = new Date(`${from}T00:00:00+05:00`);
  const end = new Date(`${to}T00:00:00+05:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

/** Yarim-ochiq kun oralig'i filtri: `col >= start AND col < end` (CLI-442 #1). */
const inRange = (col: Column, start: Date, end: Date) => and(gte(col, start), lt(col, end));

type NetServiceRow = {
  serviceName: string;
  serviceId: string | null;
  count: number;
  revenue: number;
};

/**
 * CLI-430 — byService / procedureMix net-of-refund-and-discount agregatsiyasi.
 *
 * `cashier_transaction_items.subtotal` chegirmadan OLDINGI item narxi — tranzaksiya-
 * darajali `discount` va qisman refundlar item'larda aks etmaydi (refund tx item'siz,
 * CLI-406). Shuning uchun per-tranzaksiya "net-faktor" orqali har item subtotal'ini
 * mutanosib kamaytiramiz:
 *   txGross  = Σ item.subtotal (shu tx)
 *   txNet    = tx.paidAmount − Σ (shu tx'ga bog'langan child refundlar.paidAmount)
 *   factor   = txGross > 0 ? txNet / txGross : 0
 *   perService = Σ round(item.subtotal × factor)
 * `revenue.total` (`signedPaidAmount`, cash-basis) bilan izchil bo'lishi uchun. To'liq
 * refundda (CLI-406dan keyin original `completed` qoladi) factor≈0 → o'sha xizmat
 * hissasi tabiiy ravishda 0 bo'ladi (voided-status tekshiruvi endi kerak emas).
 * `count` (procedureMix) — XOM `SUM(quantity)` (bajarilgan protsedura soni, refund
 * pulni qaytaradi lekin ishni "o'chirmaydi").
 *
 * Raw SQL (CTE) — korrelyatsiyalangan child-refund subquery + item-darajasidagi
 * proporsional taqsimot query-builder'da qulay ifodalanmaydi (self-join alias kerak).
 */
async function netServiceAggregates(
  db: DbOrTx,
  start: Date,
  end: Date,
  branchIds?: string[] | null,
): Promise<NetServiceRow[]> {
  const branchFilter = branchIds
    ? sql`AND t.branch_id IN (${sql.join(
        branchIds.map((b) => sql`${b}`),
        sql`, `,
      )})`
    : sql``;
  // Date obyekti to'g'ridan raw sql'ga interpolatsiya qilinsa postgres-js
  // parametrni string-tip sifatida yozishga urinib RangeError beradi — ISO
  // string sifatida uzatib, Postgres implicit timestamptz cast'iga tayanamiz.
  const rows = await db.execute(sql`
    WITH tx_net AS (
      SELECT
        t.id AS tx_id,
        (t.paid_amount - COALESCE((
          SELECT SUM(r.paid_amount) FROM cashier_transactions r
          WHERE r.parent_transaction_id = t.id AND r.type = 'refund'
        ), 0)) AS net_paid,
        (SELECT COALESCE(SUM(i2.subtotal), 0) FROM cashier_transaction_items i2
          WHERE i2.transaction_id = t.id) AS gross
      FROM cashier_transactions t
      WHERE t.status = 'completed'
        AND t.type = 'payment'
        AND t.created_at >= ${start.toISOString()}
        AND t.created_at < ${end.toISOString()}
        ${branchFilter}
    )
    SELECT
      MAX(i.service_name) AS "serviceName",
      i.service_id::text AS "serviceId",
      COALESCE(SUM(i.quantity), 0) AS "count",
      COALESCE(SUM(
        CASE WHEN tn.gross > 0 THEN ROUND((i.subtotal * tn.net_paid / tn.gross)::numeric, 2) ELSE 0 END
      ), 0) AS "revenue"
    FROM cashier_transaction_items i
    JOIN tx_net tn ON tn.tx_id = i.transaction_id
    -- CLI-473: guruh kaliti endi service_id (mavjud bo'lsa) — bir xil nomli,
    -- lekin turli service_id'li xizmatlar endi ALOHIDA qatorda hisoblanadi
    -- (avval GROUP BY service_name ularni birlashtirib, serviceId'ni ixtiyoriy
    -- MAX() orqali tanlardi — CLI-450 BOM lookup noto'g'ri xizmatga bog'lanardi).
    -- service_id IS NULL (eski/o'chirilgan xizmat snapshot) uchun eskicha
    -- fallback guruh — nom bo'yicha — saqlanadi (CASE ikkinchi ustun sifatida).
    GROUP BY i.service_id, CASE WHEN i.service_id IS NULL THEN i.service_name END
    ORDER BY "revenue" DESC
  `);

  return (
    rows as unknown as {
      serviceName: string;
      serviceId: string | null;
      count: string;
      revenue: string;
    }[]
  ).map((r) => ({
    serviceName: r.serviceName,
    // CLI-450: BOM (`service_materials`) `service_id` orqali bog'lanadi. CLI-473:
    // guruh kaliti endi bevosita `service_id` (SQL GROUP BY'da) — bu yerda faqat
    // o'sha ustunni o'qiydi, `MAX` orqali ixtiyoriy tanlash yo'q. `null` bo'lsa
    // (eski/o'chirilgan xizmat snapshot) — material narxi 0 bo'ladi (dentalAnalytics'da).
    serviceId: r.serviceId,
    count: Number(r.count),
    revenue: Number(r.revenue),
  }));
}

/** Har kun (from..to) uchun 'sun'..'sat' kaliti — Tashkent kuni, noon-anchored (TZ chegarasi xavfsiz). */
function* eachWeekday(from: string, to: string): Generator<string> {
  const cur = new Date(`${from}T12:00:00+05:00`);
  const last = new Date(`${to}T12:00:00+05:00`);
  while (cur.getTime() <= last.getTime()) {
    yield WEEKDAYS[cur.getUTCDay()] as string;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

/**
 * IR-06 — filial doirasi. `reportBranchScope` middleware (HTTP qatlami) chaqiruvchining
 * ruxsat etilgan filiallarini `c.var.reportBranchIds`ga qo'yadi (owner / tenant-wide → null).
 * Middleware'siz kontekstda (service-darajali testlar, worker) — so'ralgan `branchId` yoki cheklovsiz.
 */
const scopeIds = (c: Context, branchId?: string | null): string[] | null => {
  const scoped = c.get('reportBranchIds');
  if (scoped) return scoped;
  return branchId ? [branchId] : null;
};

const branchIn = (col: Column, ids: string[]) =>
  ids.length === 1 ? eq(col, ids[0] as string) : inArray(col, ids);

export const createReportsService = (deps: { audit: AuditLogger }) => {
  async function revenueTotal(c: Context, { from, to, branchId }: ReportRange): Promise<number> {
    const db = getDb(c);
    const ids = scopeIds(c, branchId);
    const { start, end } = tashkentRange(from, to);
    const base = [
      eq(cashierTransactions.status, 'completed'),
      inRange(cashierTransactions.createdAt, start, end),
    ];
    if (ids) base.push(branchIn(cashierTransactions.branchId, ids));
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
    const ids = scopeIds(c, branchId);
    const { start, end } = tashkentRange(from, to);
    const base = [inRange(appointments.startTime, start, end)];
    if (ids) base.push(branchIn(appointments.branchId, ids));
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
    const ids = scopeIds(c, branchId);
    const { start, end } = tashkentRange(from, to);

    const base = [
      eq(cashierTransactions.status, 'completed'),
      inRange(cashierTransactions.createdAt, start, end),
    ];
    if (ids) base.push(branchIn(cashierTransactions.branchId, ids));

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
      .groupBy(dayExpr)
      .orderBy(dayExpr);

    // byService — itemli POS (payment, completed), net-of-refund-and-discount (CLI-430).
    const byServiceNet = await netServiceAggregates(db, start, end, ids);
    const byService = byServiceNet.map((r) => ({ serviceName: r.serviceName, total: r.revenue }));

    const byPaymentMethod = await db
      .select({ paymentMethod: cashierTransactions.paymentMethod, total: signedPaidAmount })
      .from(cashierTransactions)
      .where(and(...base))
      .groupBy(cashierTransactions.paymentMethod)
      .orderBy(desc(signedPaidAmount));

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

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'report',
      resourceId: null,
      after: { report: 'revenue', from, to, branchId: branchId ?? null },
    });

    return {
      total: currentTotal,
      byBranch: byBranch.map((r) => ({ branchId: r.branchId, total: Number(r.total) })),
      byService: byService.map((r) => ({ serviceName: r.serviceName, total: Number(r.total) })),
      byDoctor,
      byPeriod: byPeriod.map((r) => ({ date: String(r.date), total: Number(r.total) })),
      byPaymentMethod: byPaymentMethod.map((r) => ({
        paymentMethod: r.paymentMethod,
        total: Number(r.total),
      })),
      comparison,
    };
  }

  async function appointmentStats(
    c: Context,
    { from, to, branchId }: ReportRange,
  ): Promise<AppointmentStatsReport> {
    const db = getDb(c);
    const ids = scopeIds(c, branchId);
    const { start, end } = tashkentRange(from, to);
    const base = [inRange(appointments.startTime, start, end)];
    if (ids) base.push(branchIn(appointments.branchId, ids));

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
      .where(ids ? branchIn(branches.id, ids) : undefined);
    const whById = new Map(branchRows.map((b) => [b.id, b.workHours]));

    let capacityMinutes = 0;
    for (const dr of docRows) {
      const wh = whById.get(dr.branchId) ?? null;
      for (const weekday of eachWeekday(from, to)) {
        capacityMinutes += branchOpenMinutes(wh, weekday, DEFAULT_WORK_MINUTES) * Number(dr.docs);
      }
    }

    const comparison = await buildComparison(c, { from, to, branchId }, total, appointmentCount);

    const dayExpr = sql<string>`(${appointments.startTime} AT TIME ZONE 'Asia/Tashkent')::date`;
    const periodRows = await db
      .select({ date: dayExpr, c: count() })
      .from(appointments)
      .where(and(...base))
      .groupBy(dayExpr)
      .orderBy(dayExpr);
    const byPeriod = periodRows.map((r) => ({ date: String(r.date), count: Number(r.c) }));

    const wExpr = sql<number>`EXTRACT(DOW FROM ${appointments.startTime} AT TIME ZONE 'Asia/Tashkent')::int`;
    const hExpr = sql<number>`EXTRACT(HOUR FROM ${appointments.startTime} AT TIME ZONE 'Asia/Tashkent')::int`;
    const occRows = await db
      .select({ weekday: wExpr, hour: hExpr, c: count() })
      .from(appointments)
      .where(and(...base))
      .groupBy(wExpr, hExpr);
    const occupancy = occRows.map((r) => ({
      weekday: Number(r.weekday),
      hour: Number(r.hour),
      count: Number(r.c),
    }));

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'report',
      resourceId: null,
      after: { report: 'appointment_stats', from, to, branchId: branchId ?? null },
    });

    return {
      total,
      byStatus,
      noShowRate: noShowRate(noShow, total),
      slotUtilization: utilizationPct(bookedMinutes, capacityMinutes),
      byPeriod,
      comparison,
      occupancy,
    };
  }

  async function doctorWorkload(
    c: Context,
    { from, to, branchId }: ReportRange,
  ): Promise<DoctorWorkloadRow[]> {
    const db = getDb(c);
    const ids = scopeIds(c, branchId);
    const { start, end } = tashkentRange(from, to);
    const base = [inRange(appointments.startTime, start, end)];
    if (ids) base.push(branchIn(appointments.branchId, ids));

    const rows = await db
      .select({
        doctorId: appointments.doctorId,
        total: count(),
        completed: sql<number>`COUNT(*) FILTER (WHERE ${appointments.status} = 'completed')`,
      })
      .from(appointments)
      .where(and(...base))
      .groupBy(appointments.doctorId);

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'report',
      resourceId: null,
      after: {
        report: 'doctor_workload',
        from,
        to,
        branchId: branchId ?? null,
        rowCount: rows.length,
      },
    });

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
          inRange(treatmentPlans.createdAt, start, end),
        ),
      )
      .groupBy(treatmentStages.status);

    const byStatus = rows.map((r) => ({ status: r.status as string, count: Number(r.c) }));
    const totalStages = byStatus.reduce((s, r) => s + r.count, 0);
    const completedStages = byStatus.find((r) => r.status === 'completed')?.count ?? 0;

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'report',
      resourceId: null,
      after: { report: 'plan_completion', from, to },
    });

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
    const ids = scopeIds(c, branchId);
    const { start, end } = tashkentRange(from, to);

    // 1. Procedure-mix — kassa item'lari (completed payment, oraliq, filial).
    //    `count` = XOM SUM(quantity) (bajarilgan protsedura soni); `revenue` = net-of-
    //    refund-and-discount (CLI-430) — `netServiceAggregates` bilan bir xil hisoblash.
    const mixRows = await netServiceAggregates(db, start, end, ids);

    // CLI-450: xizmat margin (BOM + item bo'yicha o'rtacha-narx approksimatsiya, v1 —
    // dokumentlashtirilgan cheklov: FIFO/batch-consumption tracking yo'q). `serviceId`
    // yo'q guruhlar (eski/o'chirilgan xizmat snapshot'i) uchun material narxi 0.
    const mixServiceIds = mixRows.map((r) => r.serviceId).filter((id): id is string => id != null);

    let materialCostByServiceId = new Map<string, number>();
    if (mixServiceIds.length > 0) {
      const avgCostRows = await db
        .select({
          itemId: stockBatches.itemId,
          avgCost: sql<string>`AVG(${stockBatches.costPerUnit})`,
        })
        .from(stockBatches)
        .where(isNotNull(stockBatches.costPerUnit))
        .groupBy(stockBatches.itemId);
      const avgCostByItemId = new Map(avgCostRows.map((r) => [r.itemId, Number(r.avgCost)]));

      const bomRows = await db
        .select({
          serviceId: serviceMaterials.serviceId,
          itemId: serviceMaterials.itemId,
          qtyPerService: serviceMaterials.qtyPerService,
        })
        .from(serviceMaterials)
        .where(inArray(serviceMaterials.serviceId, mixServiceIds));

      materialCostByServiceId = materialCostByService(
        bomRows.map((r) => ({
          serviceId: r.serviceId,
          itemId: r.itemId,
          qtyPerService: Number(r.qtyPerService),
        })),
        avgCostByItemId,
      );
    }

    const procedureMix = mixRows.map((r) =>
      computeServiceMargin(
        r.serviceName,
        r.count,
        r.revenue,
        r.serviceId ? (materialCostByServiceId.get(r.serviceId) ?? 0) : 0,
      ),
    );

    // 2. Retention — yangi (oraliqda yaratilgan) vs qaytgan (oraliqda yozilgan, lekin
    //    oraliqdan oldin yaratilgan bemor). Retention bemor-darajasida — TENANT-WIDE
    //    (Qaror #29, planCompletion pretsedenti) — `branchId` ATAYLAB ikkala tomonda
    //    ham e'tiborga olinmaydi (CLI-431: ilgari `returningPatients` branch-scoped edi,
    //    `newPatients` esa tenant-wide — asimmetriya branchId'ga qarab ichki nomuvofiq
    //    natija berardi; endi ikkalasi ham branchId'dan mustaqil, branch-invariant).
    const [newRow] = await db
      .select({ c: count() })
      .from(patients)
      .where(inRange(patients.createdAt, start, end));
    const apptRetFilter = [
      inRange(appointments.startTime, start, end),
      lt(patients.createdAt, start),
      // CLI-474 (L6): faqat HAQIQATDA kelgan (yakunlangan) vizit "bemor qaytdi"
      // deb sanaladi — cancelled/no_show/scheduled retention'ni sun'iy oshirardi
      // (bemor kelmagan bo'lsa ham "qaytgan" hisoblanardi). Appointment enum'da
      // alohida `attended` yo'q → `completed` = kelib ko'rilgan vizit.
      eq(appointments.status, 'completed'),
    ];
    const [retRow] = await db
      .select({ c: countDistinct(appointments.patientId) })
      .from(appointments)
      .innerJoin(patients, eq(appointments.patientId, patients.id))
      .where(and(...apptRetFilter));
    const newPatients = Number(newRow?.c ?? 0);
    const returningPatients = Number(retRow?.c ?? 0);

    // 3. Recall-efficacy — oraliqda yaratilgan recall'lar, status bo'yicha. TENANT-WIDE
    //    (recalls jadvalida branch ustuni yo'q) — retention bilan izchil scope.
    const recallRows = await db
      .select({ status: recalls.status, c: count() })
      .from(recalls)
      .where(inRange(recalls.createdAt, start, end))
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
    const nsFilter = [inRange(appointments.startTime, start, end)];
    if (ids) nsFilter.push(branchIn(appointments.branchId, ids));
    const nsRows = await db
      .select({
        weekday: sql<number>`EXTRACT(DOW FROM ${appointments.startTime} AT TIME ZONE 'Asia/Tashkent')::int`,
        total: count(),
        noShow: sql<number>`COUNT(*) FILTER (WHERE ${appointments.status} = 'no_show')`,
      })
      .from(appointments)
      .where(and(...nsFilter))
      .groupBy(sql`EXTRACT(DOW FROM ${appointments.startTime} AT TIME ZONE 'Asia/Tashkent')`);

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'report',
      resourceId: null,
      after: { report: 'dental_analytics', from, to, branchId: branchId ?? null },
    });

    return {
      procedureMix,
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
    const ids = scopeIds(c, branchId);
    const { start, end } = tashkentRange(from, to);
    const filter = [
      eq(cashierTransactions.status, 'completed'),
      inRange(cashierTransactions.createdAt, start, end),
    ];
    if (ids) filter.push(branchIn(cashierTransactions.branchId, ids));

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

    await deps.audit.record(c, {
      action: 'exported',
      resourceType: 'report',
      resourceId: null,
      after: { report: '1c_export', from, to, branchId: branchId ?? null, rowCount: rows.length },
    });

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

  /**
   * Bemorlar qarzi muddat bo'yicha (UI-M1). Qarz = bemor balansi > 0
   * (plan qarzi + non-plan qoldiq, patients.balance bilan bir xil formula).
   * Yosh = qarz "langari"dan hozirgacha kun: bajarilgan qarz-bosqichi `completedAt`
   * yoki reja `createdAt` (eng eskisi), non-plan to'lov `createdAt`.
   * Bemorlar tenant-darajali (Qaror #29) — filial bo'yicha bo'linmaydi.
   */
  async function debtAging(c: Context): Promise<DebtAgingReport> {
    const db = getDb(c);
    const now = Date.now();

    const planRows = await db
      .select({
        patientId: treatmentPlans.patientId,
        cost: sql<string>`COALESCE(SUM(${treatmentStages.cost}), 0)`,
        anchor: sql<
          string | null
        >`MIN(COALESCE(${treatmentStages.completedAt}, ${treatmentPlans.createdAt}))`,
      })
      .from(treatmentStages)
      .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
      .where(
        and(
          inArray(treatmentPlans.status, ['accepted', 'in_progress', 'completed']),
          ne(treatmentStages.status, 'skipped'),
          eq(treatmentStages.acceptance, 'accepted'),
        ),
      )
      .groupBy(treatmentPlans.patientId);

    const allocRows = await db
      .select({
        patientId: treatmentPlans.patientId,
        sum: sql<string>`COALESCE(SUM(${treatmentStagePayments.amount}), 0)`,
      })
      .from(treatmentStagePayments)
      .innerJoin(treatmentStages, eq(treatmentStagePayments.stageId, treatmentStages.id))
      .innerJoin(treatmentPlans, eq(treatmentStages.treatmentPlanId, treatmentPlans.id))
      .groupBy(treatmentPlans.patientId);

    const npOriginals = await db
      .select({
        id: cashierTransactions.id,
        patientId: cashierTransactions.patientId,
        totalAmount: cashierTransactions.totalAmount,
        paidAmount: cashierTransactions.paidAmount,
        createdAt: cashierTransactions.createdAt,
      })
      .from(cashierTransactions)
      .where(
        and(
          eq(cashierTransactions.type, 'payment'),
          eq(cashierTransactions.status, 'completed'),
          isNull(cashierTransactions.treatmentPlanId),
          isNotNull(cashierTransactions.patientId),
        ),
      );
    const refundRows = await db
      .select({
        parent: cashierTransactions.parentTransactionId,
        sum: sql<string>`COALESCE(SUM(${cashierTransactions.paidAmount}), 0)`,
      })
      .from(cashierTransactions)
      .where(
        and(
          eq(cashierTransactions.type, 'refund'),
          isNotNull(cashierTransactions.parentTransactionId),
        ),
      )
      .groupBy(cashierTransactions.parentTransactionId);
    const refunded = new Map(refundRows.map((r) => [r.parent as string, Number(r.sum)]));

    const planCost = new Map(planRows.map((r) => [r.patientId, Number(r.cost)]));
    const planAnchor = new Map<string, number>();
    for (const r of planRows)
      if (r.anchor) planAnchor.set(r.patientId, new Date(r.anchor).getTime());
    const alloc = new Map(allocRows.map((r) => [r.patientId, Number(r.sum)]));
    const npRows = new Map<string, NonPlanTransactionRow[]>();
    const npAnchor = new Map<string, number>();
    for (const r of npOriginals) {
      const pid = r.patientId as string;
      const list = npRows.get(pid) ?? [];
      list.push({
        totalAmount: Number(r.totalAmount),
        paidAmount: Number(r.paidAmount),
        refundedSum: refunded.get(r.id) ?? 0,
      });
      npRows.set(pid, list);
      const t = new Date(r.createdAt).getTime();
      npAnchor.set(pid, Math.min(npAnchor.get(pid) ?? t, t));
    }

    const buckets = debtAgingBucketKeys.map((key) => ({ key, amount: 0, patients: 0 }));
    let totalDebt = 0;
    let patientCount = 0;
    const ids = new Set<string>([...planCost.keys(), ...npRows.keys()]);
    for (const id of ids) {
      const { balance } = computePatientBalance({
        stageCostSum: planCost.get(id) ?? 0,
        allocationSum: alloc.get(id) ?? 0,
        nonPlanRemainder: computeNonPlanRemainder(npRows.get(id) ?? []),
      });
      if (balance <= 0) continue;
      const anchor = Math.min(planAnchor.get(id) ?? now, npAnchor.get(id) ?? now);
      const days = Math.max(0, Math.floor((now - anchor) / 86_400_000));
      const idx = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
      const b = buckets[idx] as { amount: number; patients: number };
      b.amount += balance;
      b.patients += 1;
      totalDebt += balance;
      patientCount += 1;
    }

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'report',
      resourceId: null,
      after: { report: 'debt_aging' },
    });

    return {
      totalDebt,
      patientCount,
      over90Count: (buckets[3] as { patients: number }).patients,
      buckets,
    };
  }

  /**
   * UI-M1 — rahbar «bugun» ko'rinishi (Tashkent kuni). Sof tushum = to'lovlar − refundlar
   * (P13: refund ayriladi, `signedPaidAmount`). Filial va shifokor bo'yicha bugun.
   */
  async function ownerToday(
    c: Context,
    { branchId }: { branchId?: string },
  ): Promise<OwnerTodayReport> {
    const db = getDb(c);
    const ids = scopeIds(c, branchId);
    const date = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
    const { start, end } = tashkentRange(date, date);
    const weekday = WEEKDAYS[new Date(`${date}T12:00:00+05:00`).getUTCDay()] as string;

    const txBase = [
      eq(cashierTransactions.status, 'completed'),
      inRange(cashierTransactions.createdAt, start, end),
    ];
    if (ids) txBase.push(branchIn(cashierTransactions.branchId, ids));

    const refundSum = sql<string>`COALESCE(SUM(CASE WHEN ${cashierTransactions.type} = 'refund' THEN ${cashierTransactions.paidAmount} ELSE 0 END), 0)`;
    const [totals] = await db
      .select({ net: signedPaidAmount, refunded: refundSum })
      .from(cashierTransactions)
      .where(and(...txBase));
    const methods = await db
      .select({ paymentMethod: cashierTransactions.paymentMethod, total: signedPaidAmount })
      .from(cashierTransactions)
      .where(and(...txBase))
      .groupBy(cashierTransactions.paymentMethod);
    const branchRev = await db
      .select({ branchId: cashierTransactions.branchId, total: signedPaidAmount })
      .from(cashierTransactions)
      .where(and(...txBase))
      .groupBy(cashierTransactions.branchId);
    const doctorRev = await db
      .select({ doctorId: treatmentPlans.doctorId, total: signedPaidAmount })
      .from(cashierTransactions)
      .innerJoin(treatmentPlans, eq(cashierTransactions.treatmentPlanId, treatmentPlans.id))
      .where(and(...txBase))
      .groupBy(treatmentPlans.doctorId);

    const apBase = [
      inRange(appointments.startTime, start, end),
      ne(appointments.status, 'cancelled'),
    ];
    if (ids) apBase.push(branchIn(appointments.branchId, ids));
    const apByBranch = await db
      .select({
        branchId: appointments.branchId,
        patients: countDistinct(appointments.patientId),
        minutes: sql<string>`COALESCE(SUM(EXTRACT(EPOCH FROM (${appointments.endTime} - ${appointments.startTime})) / 60), 0)`,
        docs: countDistinct(appointments.doctorId),
      })
      .from(appointments)
      .where(and(...apBase))
      .groupBy(appointments.branchId);
    const apByDoctor = await db
      .select({
        doctorId: appointments.doctorId,
        planned: count(),
        done: sql<number>`COUNT(*) FILTER (WHERE ${appointments.status} = 'completed')`,
      })
      .from(appointments)
      .where(and(...apBase))
      .groupBy(appointments.doctorId);

    const branchRows = await db
      .select({ id: branches.id, name: branches.name, workHours: branches.workHours })
      .from(branches)
      .where(ids ? branchIn(branches.id, ids) : undefined);

    const revByBranch = new Map(branchRev.map((r) => [r.branchId, Number(r.total)]));
    const apByBr = new Map(apByBranch.map((r) => [r.branchId, r]));

    const branchOut = branchRows.map((b) => {
      const ap = apByBr.get(b.id);
      const netRevenue = revByBranch.get(b.id) ?? 0;
      const capacity =
        branchOpenMinutes(b.workHours, weekday, DEFAULT_WORK_MINUTES) * Number(ap?.docs ?? 0);
      return {
        branchId: b.id,
        name: b.name,
        netRevenue,
        patients: Number(ap?.patients ?? 0),
        occupancy: utilizationPct(Number(ap?.minutes ?? 0), capacity),
        status: (ap || revByBranch.has(b.id) ? 'active' : 'idle') as 'active' | 'idle',
      };
    });

    const revByDoctor = new Map(doctorRev.map((r) => [r.doctorId, Number(r.total)]));
    const doctorIds = new Set<string>([
      ...apByDoctor.map((r) => r.doctorId),
      ...revByDoctor.keys(),
    ]);
    const apByDoc = new Map(apByDoctor.map((r) => [r.doctorId, r]));
    const doctorOut = [...doctorIds].map((doctorId) => ({
      doctorId,
      planned: Number(apByDoc.get(doctorId)?.planned ?? 0),
      done: Number(apByDoc.get(doctorId)?.done ?? 0),
      revenue: revByDoctor.get(doctorId) ?? 0,
    }));
    doctorOut.sort((a, b) => b.revenue - a.revenue || b.planned - a.planned);

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'report',
      resourceId: null,
      after: { report: 'owner_today', date, branchId: branchId ?? null },
    });

    return {
      date,
      netTotal: Number(totals?.net ?? 0),
      refunded: Number(totals?.refunded ?? 0),
      byPaymentMethod: methods.map((r) => ({
        paymentMethod: r.paymentMethod as string,
        total: Number(r.total),
      })),
      branches: branchOut,
      doctors: doctorOut,
    };
  }

  /**
   * P&L (UI-M6): sof foyda = tushum − xarajat − ish haqi.
   *  - tushum: `revenueTotal` (refund manfiy — `signedPaidAmount`), Tashkent yarim-ochiq oraliq.
   *  - xarajat: `expenses.date` kalendar kuni bo'yicha [from, to]; branchId bo'lsa shu filial.
   *  - ish haqi: davri (`periodTo`) [from, to]ga tushgan payroll run'lar (finalized + draft) jami.
   *    Payroll filialga bog'lanmagan → branchId berilsa hisobga olinmaydi (`payrollIncluded=false`).
   */
  async function pnl(c: Context, range: ReportRange): Promise<PnlReport> {
    const db = getDb(c);
    const { from, to, branchId } = range;
    const revenueAmount = await revenueTotal(c, range);

    const expFilters = [between(expenses.date, from, to)];
    if (branchId) expFilters.push(eq(expenses.branchId, branchId));
    const [expRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)` })
      .from(expenses)
      .where(and(...expFilters));
    const expenseAmount = Number(expRow?.total ?? 0);

    let payrollFinalized: number | null = null;
    let payrollDraft: number | null = null;
    let payrollRunCount = 0;
    if (!branchId) {
      const rows = await db
        .select({
          status: payrollRuns.status,
          runs: sql<number>`COUNT(DISTINCT ${payrollRuns.id})::int`,
          total: sql<string>`COALESCE(SUM(${payrollLines.total}), 0)`,
        })
        .from(payrollRuns)
        .leftJoin(payrollLines, eq(payrollLines.runId, payrollRuns.id))
        .where(between(payrollRuns.periodTo, from, to))
        .groupBy(payrollRuns.status);
      payrollFinalized = 0;
      payrollDraft = 0;
      for (const r of rows) {
        payrollRunCount += Number(r.runs);
        if (r.status === 'finalized') payrollFinalized = Number(r.total);
        else payrollDraft = Number(r.total);
      }
    }
    const payroll = payrollFinalized === null ? null : payrollFinalized + (payrollDraft ?? 0);
    const netProfit = revenueAmount - expenseAmount - (payroll ?? 0);

    await deps.audit.record(c, {
      action: 'viewed',
      resourceType: 'report',
      resourceId: null,
      after: { report: 'pnl', from, to, branchId: branchId ?? null },
    });

    return {
      revenue: revenueAmount,
      expenses: expenseAmount,
      payroll,
      payrollFinalized,
      payrollDraft,
      payrollRunCount,
      payrollIncluded: payroll !== null,
      netProfit,
    };
  }

  /** FU-31: `reportBranchScope` doirasidagi filiallar (null = butun klinika). */
  async function reportBranches(c: Context) {
    const ids = scopeIds(c);
    const rows = await getDb(c)
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(
        ids
          ? and(isNull(branches.deletedAt), branchIn(branches.id, ids))
          : isNull(branches.deletedAt),
      );
    return { branches: rows, allowAllBranches: ids === null };
  }

  return {
    reportBranches,
    pnl,
    debtAging,
    ownerToday,
    revenue,
    appointmentStats,
    doctorWorkload,
    planCompletion,
    dentalAnalytics,
    oneCExport,
  };
};

export type ReportsService = ReturnType<typeof createReportsService>;
