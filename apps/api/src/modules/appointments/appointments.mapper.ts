import type { Appointment } from '@dental/db-schema';
import type { AppointmentDto } from './appointments.schema.ts';

/** DB row (Date timestamps) → wire DTO (ISO strings, nullable fields preserved). */
export const toAppointmentDto = (row: Appointment): AppointmentDto => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId,
  patientId: row.patientId,
  doctorId: row.doctorId,
  assistantId: row.assistantId ?? null,
  startTime: row.startTime.toISOString(),
  endTime: row.endTime.toISOString(),
  status: row.status,
  serviceIds: row.serviceIds ?? null,
  notes: row.notes ?? null,
  cancellationReason: row.cancellationReason ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
