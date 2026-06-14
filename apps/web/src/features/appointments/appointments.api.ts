import type { CreateAppointmentBody } from '@dental/api-client';
import {
  cancelAppointment,
  createAppointment,
  listAppointments,
  listBranches,
  listDoctors,
  listServices,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lookupKeys } from '@/lib/lookup-keys';
import { appointmentKeys } from './appointments.keys';

export function useAppointments(range: { branchId?: string; from: string; to: string }) {
  return useQuery({
    queryKey: appointmentKeys.list(range),
    queryFn: () =>
      listAppointments({ branchId: range.branchId, from: range.from, to: range.to }).then(
        (r) => r.data,
      ),
  });
}

/**
 * Yozilish uchun doktorlar — yengil `GET /appointments/doctors` (`appointment.view`).
 * Avval `GET /users/assignments` (`user.view`) ishlatilardi — Receptionist'da o'sha
 * ruxsat yo'q → 403 → dropdown bo'sh edi (CLI-154). Backend allaqachon `{id, name}`
 * qaytaradi (doctor-rolli, dedupe).
 */
export function useDoctors() {
  return useQuery({
    queryKey: appointmentKeys.doctors(),
    queryFn: () => listDoctors().then((r) => r.data),
  });
}

/** Branch xizmatlari ro'yxati (MultiSelect opsiyalari uchun). */
export function useServices() {
  return useQuery({
    queryKey: lookupKeys.services(),
    queryFn: () => listServices().then((r) => r.data),
  });
}

/** Tenant filiallari (branch filter Select uchun). */
export function useBranches() {
  return useQuery({
    queryKey: lookupKeys.branches(),
    queryFn: () => listBranches().then((r) => r.data),
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAppointmentBody) => createAppointment(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      cancelAppointment(id, reason !== undefined ? { reason } : undefined).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: appointmentKeys.all }),
  });
}
