import { customInstance } from '@dental/api-client';
import { useQuery } from '@tanstack/react-query';
import { dashboardKeys } from './dashboard.keys';

export interface DoctorPendingItem {
  id: string;
  patientId: string;
  patientName: string;
  at: string;
}
export interface DoctorNextPatient {
  appointmentId: string;
  patientId: string;
  patientName: string;
  startTime: string;
  dateOfBirth: string | null;
  waitingMinutes: number | null;
  queueTicketId: string | null;
  allergies: { substance: string; severity: string }[];
  lab: {
    orderType: string;
    labName: string;
    status: string;
    detail: string | null;
    at: string;
  } | null;
  lastVisit: { date: string; summary: string | null } | null;
}
export interface DoctorPending {
  nextPatient: DoctorNextPatient | null;
  unsignedVisitNotes: { count: number; items: DoctorPendingItem[] };
  unreviewedImages: { count: number; items: DoctorPendingItem[] };
  plansAwaitingResponse: { count: number; oldestDays: number | null; items: DoctorPendingItem[] };
}

// TODO(contract): `generate:contract`dan keyin generated `getDoctorPending` bilan almashtiriladi.
const fetchDoctorPending = () =>
  customInstance<{ success: true; data: DoctorPending }>({
    url: '/api/dashboard/doctor-pending',
    method: 'GET',
  }).then((r) => r.data);

/** «Mendan kutilmoqda» — appointment.view + medical_record.view bilan gate (403 portlamasin). */
export function useDoctorPending(enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.doctorPending(),
    queryFn: fetchDoctorPending,
    enabled,
  });
}
