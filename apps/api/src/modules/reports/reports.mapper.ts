import type {
  AppointmentStatsReport,
  DentalAnalyticsReport,
  DoctorWorkloadRow,
  PlanCompletionReport,
  RevenueReport,
} from './reports.schema.ts';

/**
 * Report mappers — aggregation result → wire DTO.
 *
 * The service aggregations already coerce SQL `numeric`/`bigint` results to JS
 * `number` (via `Number(...)`) and emit `date` as a `string`, so these mappers
 * are shape-preserving: they re-project field-by-field to guarantee the wire
 * shape exactly matches the response DTO contract (no extra/missing keys).
 */

export const toRevenueReportDto = (r: RevenueReport): RevenueReport => ({
  total: r.total,
  byBranch: r.byBranch.map((b) => ({ branchId: b.branchId, total: b.total })),
  byService: r.byService.map((s) => ({ serviceName: s.serviceName, total: s.total })),
  byDoctor: r.byDoctor.map((d) => ({ doctorId: d.doctorId, total: d.total })),
  byPeriod: r.byPeriod.map((p) => ({ date: p.date, total: p.total })),
  byPaymentMethod: r.byPaymentMethod.map((p) => ({
    paymentMethod: p.paymentMethod,
    total: p.total,
  })),
  comparison: {
    previous: r.comparison.previous && { ...r.comparison.previous },
    yoy: r.comparison.yoy && { ...r.comparison.yoy },
  },
});

export const toAppointmentStatsReportDto = (r: AppointmentStatsReport): AppointmentStatsReport => ({
  total: r.total,
  byStatus: r.byStatus.map((s) => ({ status: s.status, count: s.count })),
  noShowRate: r.noShowRate,
  slotUtilization: r.slotUtilization,
  byPeriod: r.byPeriod.map((p) => ({ date: p.date, count: p.count })),
  comparison: {
    previous: r.comparison.previous && { ...r.comparison.previous },
    yoy: r.comparison.yoy && { ...r.comparison.yoy },
  },
});

export const toDoctorWorkloadReportDto = (rows: DoctorWorkloadRow[]): DoctorWorkloadRow[] =>
  rows.map((r) => ({ doctorId: r.doctorId, total: r.total, completed: r.completed }));

export const toPlanCompletionReportDto = (r: PlanCompletionReport): PlanCompletionReport => ({
  totalStages: r.totalStages,
  completedStages: r.completedStages,
  rate: r.rate,
  byStatus: r.byStatus.map((s) => ({ status: s.status, count: s.count })),
});

export const toDentalAnalyticsReportDto = (r: DentalAnalyticsReport): DentalAnalyticsReport => ({
  procedureMix: r.procedureMix.map((p) => ({ ...p })),
  retention: { ...r.retention },
  recallEfficacy: {
    ...r.recallEfficacy,
    byStatus: r.recallEfficacy.byStatus.map((s) => ({ ...s })),
  },
  noShowByWeekday: r.noShowByWeekday.map((w) => ({ ...w })),
});
