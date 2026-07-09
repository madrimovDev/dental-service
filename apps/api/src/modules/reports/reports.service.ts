import {
  appointments,
  branches,
  cashierTransactions,
  patients,
  recalls,
  serviceMaterials,
  stockBatches,
  treatmentPlans,
  treatmentStages,
} from '@dental/db-schema';
import type { Column } from 'drizzle-orm';
import {
  and,
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
  branchId?: string | null,
): Promise<NetServiceRow[]> {
  const branchFilter = branchId ? sql`AND t.branch_id = ${branchId}` : sql``;
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

export const createReportsService = (deps: { audit: AuditLogger }) => {
  async function revenueTotal(c: Context, { from, to, branchId }: ReportRange): Promise<number> {
    const db = getDb(c);
    const { start, end } = tashkentRange(from, to);
    const base = [
      eq(cashierTransactions.status, 'completed'),
      inRange(cashierTransactions.createdAt, start, end),
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
    const base = [inRange(appointments.startTime, start, end)];
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
      inRange(cashierTransactions.createdAt, start, end),
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
      .groupBy(dayExpr)
      .orderBy(dayExpr);

    // byService — itemli POS (payment, completed), net-of-refund-and-discount (CLI-430).
    const byServiceNet = await netServiceAggregates(db, start, end, branchId);
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
    const { start, end } = tashkentRange(from, to);
    const base = [inRange(appointments.startTime, start, end)];
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
    const { start, end } = tashkentRange(from, to);
    const base = [inRange(appointments.startTime, start, end)];
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
    const { start, end } = tashkentRange(from, to);

    // 1. Procedure-mix — kassa item'lari (completed payment, oraliq, filial).
    //    `count` = XOM SUM(quantity) (bajarilgan protsedura soni); `revenue` = net-of-
    //    refund-and-discount (CLI-430) — `netServiceAggregates` bilan bir xil hisoblash.
    const mixRows = await netServiceAggregates(db, start, end, branchId);

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
    const { start, end } = tashkentRange(from, to);
    const filter = [
      eq(cashierTransactions.status, 'completed'),
      inRange(cashierTransactions.createdAt, start, end),
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
