import { z } from '@hono/zod-openapi';

export const reportRangeSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  branchId: z.uuid().optional(),
});
export type ReportRange = z.infer<typeof reportRangeSchema>;

// ─── Period comparison (DS12-A) ──────────────────────────────────────────────
const comparisonEntryDtoSchema = z.object({ total: z.number(), deltaPct: z.number() });
export const periodComparisonDtoSchema = z
  .object({
    previous: comparisonEntryDtoSchema.nullable(),
    yoy: comparisonEntryDtoSchema.nullable(),
  })
  .openapi('PeriodComparison');
export type PeriodComparison = z.infer<typeof periodComparisonDtoSchema>;

// ─── Revenue report ─────────────────────────────────────────────────────────

/**
 * Revenue report DTO — wire shape matches `RevenueReport` in
 * `packages/api-client/src/types-reports.ts`. Aggregate totals are numbers.
 */
export const revenueReportDtoSchema = z
  .object({
    total: z.number(),
    byBranch: z.array(z.object({ branchId: z.string(), total: z.number() })),
    // CLI-430: net-of-refund-and-discount (per-tx net-faktor bilan proporsional
    // taqsimlangan) — xom `Σ item.subtotal` EMAS. `revenue.total` (cash-basis) bilan
    // izchil (`Σ byService ≈ total`, kichik yaxlitlash farqidan tashqari).
    byService: z.array(z.object({ serviceName: z.string(), total: z.number() })),
    byDoctor: z.array(z.object({ doctorId: z.string().nullable(), total: z.number() })),
    byPeriod: z.array(z.object({ date: z.string(), total: z.number() })),
    byPaymentMethod: z.array(z.object({ paymentMethod: z.string(), total: z.number() })),
    comparison: periodComparisonDtoSchema,
  })
  .openapi('RevenueReport');

export type RevenueReport = z.infer<typeof revenueReportDtoSchema>;

// ─── Appointment stats report ────────────────────────────────────────────────

/** Matches `AppointmentStatsReport` in `packages/api-client/src/types-reports.ts`. */
export const appointmentStatsReportDtoSchema = z
  .object({
    total: z.number(),
    byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
    noShowRate: z.number(),
    slotUtilization: z.number(),
    byPeriod: z.array(z.object({ date: z.string(), count: z.number() })),
    comparison: periodComparisonDtoSchema,
    occupancy: z.array(z.object({ weekday: z.number(), hour: z.number(), count: z.number() })),
  })
  .openapi('AppointmentStatsReport');

export type AppointmentStatsReport = z.infer<typeof appointmentStatsReportDtoSchema>;

// ─── Doctor workload ─────────────────────────────────────────────────────────

/** Matches `DoctorWorkloadRow` in `packages/api-client/src/types-reports.ts`. */
export const doctorWorkloadRowDtoSchema = z
  .object({
    doctorId: z.string(),
    total: z.number(),
    completed: z.number(),
  })
  .openapi('DoctorWorkloadRow');

export type DoctorWorkloadRow = z.infer<typeof doctorWorkloadRowDtoSchema>;

export const doctorWorkloadReportDtoSchema = z
  .array(doctorWorkloadRowDtoSchema)
  .openapi('DoctorWorkloadReport');

// ─── Plan completion report ──────────────────────────────────────────────────

/** Matches `PlanCompletionReport` in `packages/api-client/src/types-reports.ts`. */
export const planCompletionReportDtoSchema = z
  .object({
    totalStages: z.number(),
    completedStages: z.number(),
    rate: z.number(),
    byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
  })
  .openapi('PlanCompletionReport');

export type PlanCompletionReport = z.infer<typeof planCompletionReportDtoSchema>;

// ─── Dental analytics report (V2-3) ──────────────────────────────────────────

/**
 * Dental-spetsifik analitika: procedure-mix, bemor retention, recall samaradorligi,
 * no-show trend (hafta-kuni bo'yicha).
 *
 * **Filial (`branchId`) scope — sub-metrika bo'yicha izchil hujjatlashtirilgan:**
 * - `procedureMix`, `noShowByWeekday` — **branch-scoped** (`cashier_transactions` /
 *   `appointments`da `branchId` bor, filtr qo'llanadi).
 * - `retention`, `recallEfficacy` — **tenant-wide** (bemor/recall branch-siz, Qaror #29,
 *   planCompletion pretsedenti; CLI-431 — ilgari `retention.returningPatients` branch-
 *   scoped edi, `newPatients` esa tenant-wide edi — asimmetriya branchId'ga qarab ichki
 *   nomuvofiq natija berardi; endi ikkalasi ham branchId'dan mustaqil).
 */
export const dentalAnalyticsReportDtoSchema = z
  .object({
    // CLI-430: net-of-refund-and-discount (netServiceAggregates) — `count` = xom
    // bajarilgan protsedura soni (SUM quantity), `revenue` = net collected (chegirma +
    // qisman refund hisobga olingan, `revenue.total` bilan izchil cash-basis).
    // CLI-450: `materialCost`/`margin`/`marginPct` — BOM (`service_materials`) + item
    // bo'yicha o'rtacha narx (`stock_batches.costPerUnit`) asosida, v1 approksimatsiya
    // (FIFO/batch-consumption tracking yo'q, dokumentlashtirilgan cheklov). `marginPct`
    // `revenue === 0` bo'lsa `null` (ma'noli foiz yo'q).
    procedureMix: z.array(
      z.object({
        serviceName: z.string(),
        count: z.number(),
        revenue: z.number(),
        materialCost: z.number(),
        margin: z.number(),
        marginPct: z.number().nullable(),
      }),
    ),
    // Tenant-wide (CLI-431) — branchId'dan mustaqil (branch-invariant).
    retention: z.object({
      newPatients: z.number(),
      returningPatients: z.number(),
      retentionRate: z.number(),
    }),
    // Tenant-wide — recalls jadvalida branch ustuni yo'q (o'zgarmadi).
    recallEfficacy: z.object({
      total: z.number(),
      converted: z.number(),
      efficacy: z.number(),
      byStatus: z.array(z.object({ status: z.string(), count: z.number() })),
    }),
    noShowByWeekday: z.array(
      z.object({
        weekday: z.number(),
        total: z.number(),
        noShow: z.number(),
        rate: z.number(),
      }),
    ),
  })
  .openapi('DentalAnalyticsReport');

export type DentalAnalyticsReport = z.infer<typeof dentalAnalyticsReportDtoSchema>;

// ─── 1C export — transaction-level (V3-4) ────────────────────────────────────

/**
 * Buxgalteriya (1C) eksporti uchun tranzaksiya-darajali qator. ⚠️ FORMAT PROVIZIONAL:
 * aniq 1C interchange (CommerceML/CSV ustun-xaritasi) mijozning 1C konfiguratsiyasiga
 * (hisoblar rejasi) bog'liq — FE `format1C` standart shaklni beradi, mijoz XSD bilan
 * moslash TODO (Qaror — V3 tashqi-dep, scaffold chegarasi).
 */
export const oneCExportRowDtoSchema = z
  .object({
    date: z.string(),
    receiptNumber: z.string().nullable(),
    type: z.string(),
    paymentMethod: z.string(),
    amount: z.number(),
    patientName: z.string().nullable(),
  })
  .openapi('OneCExportRow');

export const oneCExportReportDtoSchema = z
  .array(oneCExportRowDtoSchema)
  .openapi('OneCExportReport');
export type OneCExportRow = z.infer<typeof oneCExportRowDtoSchema>;
