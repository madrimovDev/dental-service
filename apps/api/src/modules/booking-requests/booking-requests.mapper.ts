import type { BookingRequest } from '@dental/db-schema';
import type { BookingRequestDto } from './booking-requests.schema.ts';

export const toBookingRequestDto = (r: {
  row: BookingRequest;
  branchName: string | null;
  patientName: string | null;
  doctorName: string | null;
}): BookingRequestDto => ({
  id: r.row.id,
  status: r.row.status,
  requestedStart: r.row.requestedStart.toISOString(),
  createdAt: r.row.createdAt.toISOString(),
  branchId: r.row.branchId,
  branchName: r.branchName,
  patientId: r.row.patientId,
  patientName: r.patientName,
  doctorId: r.row.doctorId,
  doctorName: r.doctorName,
  rescheduleOfAppointmentId: r.row.rescheduleOfAppointmentId,
  appointmentId: r.row.appointmentId,
  declineReason: r.row.declineReason,
});
