import {
  type CreateQueueTicketBody,
  createQueueTicket,
  getCheckInCandidates,
  getQueueToday,
  listBranches,
  listServices,
  type QueueStatus,
  updateQueueTicketStatus,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { queueKeys } from './queue.keys';

export function useQueueToday(branchId: string | null) {
  return useQuery({
    queryKey: queueKeys.today(branchId ?? ''),
    queryFn: () => getQueueToday({ branchId: branchId ?? '' }).then((r) => r.data),
    enabled: !!branchId,
    refetchInterval: 10_000,
  });
}

export function useCheckInCandidates(branchId: string | null) {
  return useQuery({
    queryKey: queueKeys.candidates(branchId ?? ''),
    queryFn: () => getCheckInCandidates({ branchId: branchId ?? '' }).then((r) => r.data),
    enabled: !!branchId,
    refetchInterval: 10_000,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateQueueTicketBody) => createQueueTicket(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queueKeys.all }),
  });
}

export function useUpdateQueueStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: QueueStatus }) =>
      updateQueueTicketStatus(id, { status }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queueKeys.all });
      // Backend done→completed / missed→no_show appointment'ni sync qiladi —
      // kalendar cache'ni ham yangilash kerak.
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

/** Lookup ma'lumotlari (bemor/xizmat nomlari + branch ro'yxati). */
export function usePatientsAll() {
  return useQuery({
    queryKey: ['patients', 'list-all'],
    queryFn: () => api.patients.list({ pageSize: 100 }),
  });
}

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: () => listServices().then((r) => r.data) });
}

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => listBranches().then((r) => r.data) });
}
