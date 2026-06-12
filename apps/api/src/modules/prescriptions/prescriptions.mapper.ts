import type { Prescription } from '@dental/db-schema';
import type { PrescriptionDto } from './prescriptions.schema.ts';

/** DB row (Date timestamps) → wire DTO (ISO strings, nullable fields preserved). */
export const toPrescriptionDto = (row: Prescription): PrescriptionDto => ({
  id: row.id,
  tenantId: row.tenantId,
  patientId: row.patientId,
  doctorId: row.doctorId,
  visitNoteId: row.visitNoteId ?? null,
  issuedDate: row.issuedDate.toISOString(),
  items: row.items,
  diagnosis: row.diagnosis ?? null,
  notes: row.notes ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
