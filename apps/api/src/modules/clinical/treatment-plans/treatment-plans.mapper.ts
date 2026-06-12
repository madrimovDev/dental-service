import type { treatmentPlans, treatmentStages } from '@dental/db-schema';
import type {
  TreatmentPlanDto,
  TreatmentPlanWithStagesDto,
  TreatmentStageDto,
} from './treatment-plans.schema.ts';

type PlanRow = typeof treatmentPlans.$inferSelect;
type StageRow = typeof treatmentStages.$inferSelect;

/** DB row → TreatmentStage wire DTO (Date timestamps → ISO strings). */
export const toStageDto = (row: StageRow): TreatmentStageDto => ({
  id: row.id,
  treatmentPlanId: row.treatmentPlanId,
  sequence: row.sequence,
  serviceId: row.serviceId ?? null,
  serviceName: row.serviceName,
  toothNumbers: row.toothNumbers ?? null,
  estimatedVisits: row.estimatedVisits,
  estimatedDurationMinutes: row.estimatedDurationMinutes ?? null,
  cost: row.cost,
  status: row.status,
  notes: row.notes ?? null,
  completedAt: row.completedAt ? row.completedAt.toISOString() : null,
});

/** DB row → TreatmentPlan wire DTO (no stages). */
export const toPlanDto = (row: PlanRow): TreatmentPlanDto => ({
  id: row.id,
  tenantId: row.tenantId,
  patientId: row.patientId,
  doctorId: row.doctorId,
  title: row.title,
  status: row.status,
  totalCost: row.totalCost,
  totalVisits: row.totalVisits,
  notes: row.notes ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** DB plan row + stages array → TreatmentPlanWithStages wire DTO. */
export const toPlanWithStagesDto = (
  row: PlanRow & { stages: StageRow[] },
): TreatmentPlanWithStagesDto => ({
  ...toPlanDto(row),
  stages: row.stages.map(toStageDto),
});
