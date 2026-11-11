import type {
  LabHubLabRecord,
  LabHubMessageRecord,
  LabHubPriceApprovalRecord,
  LabHubStatusRecord,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { clinicalKeys } from '../../clinical.keys';
import type { LabOrderWire } from './lab-order.helpers';

/**
 * Mutatsiyalar o'z xato matnini (`labHubClinic.err_*`, Hub kodi bo'yicha) chaqiruv joyida
 * ko'rsatadi — global qizil toast ikkilanmasligi uchun hook darajasida jim `onError`.
 */
const quiet = () => {};

/**
 * Lab Hub (W2 clinic-sync) hook'lari: ulanish holati, katalog, «Laboratoriyaga yuborish»,
 * narx tasdig'i, yozishma. Server Hub bilan 60 s siklda sinxronlanadi — xabarlar ochiq
 * sahifada 30 s'da qayta so'raladi.
 */
export function useLabHubStatus(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: clinicalKeys.labHubStatus(),
    queryFn: () => api.labHub.status(),
    enabled: opts.enabled ?? true,
    retry: false,
  });
}

/** Faqat ulangan klinikada (aks holda 409) — katalog + ulanish holati (internetsiz — kesh). */
export function useLabHubLabs(opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: clinicalKeys.labHubLabs(),
    queryFn: () => api.labHub.labs(),
    enabled: opts.enabled ?? true,
    retry: false,
  });
}

/** Buyurtma yuborish mumkin bo'lgan (faol ulangan) lablar. */
export const activeLabs = (labs: readonly LabHubLabRecord[] | undefined) =>
  (labs ?? []).filter((l) => l.linkStatus === 'active');

export function useConnectLabHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.labHub.connect(),
    onError: quiet,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clinicalKeys.labHubStatus() });
      qc.invalidateQueries({ queryKey: clinicalKeys.labHubLabs() });
    },
  });
}

export function useRequestLabLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labId: string) => api.labHub.requestLink(labId),
    onError: quiet,
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.labHubLabs() }),
  });
}

export function useSendToLabHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ labOrderId, labId }: { labOrderId: string; labId: string }) =>
      api.labHub.sendToHub<LabOrderWire>(labOrderId, labId),
    onError: quiet,
    onSuccess: (order) => {
      qc.invalidateQueries({ queryKey: clinicalKeys.labOrder(order.id) });
      qc.invalidateQueries({ queryKey: clinicalKeys.labOrders(order.patientId) });
      qc.invalidateQueries({ queryKey: clinicalKeys.labHubStatus() });
    },
  });
}

/**
 * Narx tasdig'i — ekranda ko'rsatilgan narx yuboriladi (TOCTOU: lab poll orasida narxni
 * o'zgartirgan bo'lsa server 409 `price.changed` qaytaradi, xarajat yozilmaydi). Xatoda ham
 * buyurtma qayta so'raladi — foydalanuvchi yangi narxni ko'radi.
 */
export function useApproveLabPrice(labOrderId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: clinicalKeys.labOrder(labOrderId) });
  return useMutation<LabHubPriceApprovalRecord, unknown, string>({
    mutationFn: (shownPrice) => api.labHub.approvePrice(labOrderId, shownPrice),
    onError: () => {
      void refresh();
    },
    onSuccess: () => refresh(),
  });
}

export function useLabHubMessages(labOrderId: string, enabled = true) {
  return useQuery<LabHubMessageRecord[]>({
    queryKey: clinicalKeys.labHubMessages(labOrderId),
    queryFn: () => api.labHub.messages(labOrderId),
    enabled: enabled && !!labOrderId,
    refetchInterval: 30_000,
  });
}

export function usePostLabHubMessage(labOrderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.labHub.postMessage(labOrderId, body),
    onError: quiet,
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.labHubMessages(labOrderId) }),
  });
}

export type { LabHubLabRecord, LabHubMessageRecord, LabHubStatusRecord };
