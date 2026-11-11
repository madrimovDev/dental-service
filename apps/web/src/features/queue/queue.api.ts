import {
  type CreateQueueTicketBody,
  createQueueTicket,
  customInstance,
  getCheckInCandidates,
  getQueueToday,
  listBranches,
  listPatients,
  listServices,
  type QueueStatus,
  updateQueueTicketStatus,
} from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { appointmentKeys } from '@/features/appointments/appointments.keys';
import { i18n } from '@/lib/i18n.ts';
import { lookupKeys } from '@/lib/lookup-keys';
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

/** SC-09: backend javobidagi `appointmentSyncError` (yozilish sync'i bajarilmadi) — jim yutilmaydi. */
type SyncAware = { appointmentSyncError?: string | null };

export function warnIfAppointmentSyncFailed(ticket: unknown) {
  const code = (ticket as SyncAware | undefined)?.appointmentSyncError;
  if (!code) return;
  notifications.show({
    color: 'yellow',
    message: i18n.t('queueBoard.sync_failed', { code }),
  });
}

export function useUpdateQueueStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: QueueStatus }) =>
      updateQueueTicketStatus(id, { status }).then((r) => r.data),
    onSuccess: (ticket) => {
      warnIfAppointmentSyncFailed(ticket);
      void qc.invalidateQueries({ queryKey: queueKeys.all });
      // Backend done→completed / missed→no_show appointment'ni sync qiladi —
      // kalendar cache'ni ham yangilash kerak.
      void qc.invalidateQueries({ queryKey: appointmentKeys.all });
    },
  });
}

/**
 * Shifokor o'z bemorini chaqiradi (`POST /queue/{id}/call-own`, queue.manage SHART EMAS).
 * TODO(generate:contract): generated `callOwnQueueTicket` paydo bo'lgach shu yerni almashtiring.
 */
export function useCallOwnTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      customInstance<{ data: SyncAware }>({
        url: `/api/queue/${id}/call-own`,
        method: 'POST',
      }).then((r) => r.data),
    onSuccess: (ticket) => {
      warnIfAppointmentSyncFailed(ticket);
      void qc.invalidateQueries({ queryKey: queueKeys.all });
      void qc.invalidateQueries({ queryKey: appointmentKeys.all });
    },
  });
}

/**
 * Lookup ma'lumotlari (bemor/xizmat nomlari + branch ro'yxati). CLI-454: `search` —
 * debounced server-side qidiruv; ro'yxat endi oxirgi 100 yozuv bilan cheklanmaydi
 * (backend `ilike` filtri bilan qidiradi, `pageSize:100` faqat natija sahifasi hajmi).
 */
export function usePatientsAll(search = '') {
  return useQuery({
    queryKey: lookupKeys.patientsAll(search),
    queryFn: () => listPatients({ search: search || undefined, pageSize: 100 }).then((r) => r.data),
  });
}

export function useServices() {
  return useQuery({
    queryKey: lookupKeys.services(),
    queryFn: () => listServices().then((r) => r.data),
  });
}

export function useBranches() {
  return useQuery({
    queryKey: lookupKeys.branches(),
    queryFn: () => listBranches().then((r) => r.data),
  });
}
