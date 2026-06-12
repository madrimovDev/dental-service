import { z } from '@hono/zod-openapi';

export const reportRangeSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  branchId: z.uuid().optional(),
});
export type ReportRange = z.infer<typeof reportRangeSchema>;

// ─── Revenue report ─────────────────────────────────────────────────────────

/**
 * Revenue report DTO — wire shape matches `RevenueReport` in
 * `packages/api-client/src/types-reports.ts`. Aggregate totals are numbers.
 */
export const revenueReportDtoSchema = z
  .object({
    total: z.number(),
    byBranch: z.array(z.object({ branchId: z.string(), total: z.number() })),
    byService: z.array(z.object({ serviceName: z.string(), total: z.number() })),
    byDoctor: z.array(z.object({ doctorId: z.string().nullable(), total: z.number() })),
    byPeriod: z.array(z.object({ date: z.string(), total: z.number() })),
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
