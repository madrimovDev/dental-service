import type { QueueTicket } from '@dental/db-schema';
import type { CheckInCandidateDto, QueueTicketDto } from './queue.schema.ts';

/** DB row (Date timestamps) → wire DTO (ISO strings, nullable fields guarded). */
export const toQueueTicketDto = (row: QueueTicket): QueueTicketDto => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId,
  patientId: row.patientId ?? null,
  serviceId: row.serviceId ?? null,
  doctorId: row.doctorId ?? null,
  appointmentId: row.appointmentId ?? null,
  queueNumber: row.queueNumber,
  ticketDate: row.ticketDate.toISOString(),
  status: row.status,
  calledAt: row.calledAt ? row.calledAt.toISOString() : null,
  finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Partial appointment row (from checkInCandidates select) → CheckInCandidate wire DTO.
 * The row is a Drizzle partial select — all Date fields are Date objects.
 */
export const toCheckInCandidateDto = (row: {
  id: string;
  tenantId: string;
  branchId: string;
  patientId: string;
  doctorId: string;
  assistantId: string | null;
  startTime: Date;
  endTime: Date;
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'no_show' | 'cancelled';
  serviceIds: string[] | null;
  notes: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CheckInCandidateDto => ({
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
