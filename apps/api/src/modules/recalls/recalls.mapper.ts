import type { Recall } from '@dental/db-schema';
import type { RecallDto } from './recalls.schema.ts';

/** recalls row + patient join (name/phone) — repository qaytaradigan shakl. */
export type RecallWithPatient = Recall & {
  patientName: string;
  patientPhone: string | null;
};

/** PII masklash — `patient.view_pii` yo'q rolda telefon yashiriladi (patients moduli bilan izchil). */
const maskString = (s: string, keepLastN: number): string => {
  if (s.length <= keepLastN) return '*'.repeat(s.length);
  return '*'.repeat(s.length - keepLastN) + s.slice(-keepLastN);
};

/**
 * recalls row (+ patient join) → DTO.
 * - `dueDate` `date` ustun → string passthrough (instant emas).
 * - timestamp ustunlar → ISO string.
 * - `maskPhone=true` bo'lsa bemor telefoni masklanadi (PII gate; routes `patient.view_pii`'dan beradi).
 */
export const toRecallDto = (row: RecallWithPatient, maskPhone = false): RecallDto => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId ?? null,
  patientId: row.patientId,
  patientName: row.patientName,
  patientPhone: row.patientPhone
    ? maskPhone
      ? maskString(row.patientPhone, 4)
      : row.patientPhone
    : null,
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
