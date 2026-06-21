import type { Recall } from '@dental/db-schema';
import type { RecallDto } from './recalls.schema.ts';

/** recalls row + patient join (name/phone) — repository qaytaradigan shakl. */
export type RecallWithPatient = Recall & {
  patientName: string;
  patientPhone: string | null;
};

/**
 * recalls row (+ patient join) → DTO.
 * - `dueDate` `date` ustun → string passthrough (instant emas).
 * - timestamp ustunlar → ISO string.
 */
export const toRecallDto = (row: RecallWithPatient): RecallDto => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId ?? null,
  patientId: row.patientId,
  patientName: row.patientName,
  patientPhone: row.patientPhone ?? null,
  reason: row.reason,
  status: row.status,
  source: row.source,
  dueDate: row.dueDate,
  intervalMonths: row.intervalMonths ?? null,
  sourceStageId: row.sourceStageId ?? null,
  treatmentPlanId: row.treatmentPlanId ?? null,
  scheduledAppointmentId: row.scheduledAppointmentId ?? null,
  assignedDoctorId: row.assignedDoctorId ?? null,
  lastContactedAt: row.lastContactedAt ? row.lastContactedAt.toISOString() : null,
  contactAttempts: row.contactAttempts,
  notes: row.notes ?? null,
  createdBy: row.createdBy ?? null,
  closedBy: row.closedBy ?? null,
  closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
