import type { CreateAppointmentBody } from '@dental/api-client';
import {
  cancelAppointment,
  createAppointment,
  listAppointments,
  listBranches,
  listServices,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { appointmentKeys } from './appointments.keys';
import type { Doctor } from './appointments.types';

export function useAppointments(range: { branchId?: string; from: string; to: string }) {
  return useQuery({
    queryKey: appointmentKeys.list(range),
    queryFn: () =>
      listAppointments({ branchId: range.branchId, from: range.from, to: range.to }).then(
        (r) => r.data,
      ),
  });
}

/** Branch doktorlari — listAssignments (roleName ≈ doctor). */
export function useDoctors() {
  return useQuery({
    queryKey: ['doctors', 'list'],
    queryFn: async (): Promise<Doctor[]> => {
      const assignments = await api.users.listAssignments();
      const docs = assignments
        .filter((a) => a.roleName.toLowerCase().includes('doctor'))
        .map((a) => ({ id: a.userId, name: a.userFullName ?? a.userPhone }));
      return Array.from(new Map(docs.map((d) => [d.id, d])).values());
    },
  });
}

/** Branch xizmatlari ro'yxati (MultiSelect opsiyalari uchun). */
export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: () => listServices().then((r) => r.data) });
}

/** Tenant filiallari (branch filter Select uchun). */
export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => listBranches().then((r) => r.data) });
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
