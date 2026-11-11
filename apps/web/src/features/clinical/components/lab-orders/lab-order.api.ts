import type { LabOrderFileRecord } from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { clinicalKeys } from '../../clinical.keys';

/** Buyurtma fayllari (UI-D5) — `lab_order.view`; faqat kengaytirilganda yuklanadi. */
export function useLabOrderFiles(labOrderId: string, enabled = true) {
  return useQuery({
    queryKey: clinicalKeys.labOrderFiles(labOrderId),
    queryFn: () => api.labOrders.listFiles(labOrderId),
    enabled: enabled && !!labOrderId,
  });
}

export function useUploadLabOrderFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      labOrderId,
      file,
      label,
    }: {
      labOrderId: string;
      file: File;
      label?: string;
    }) => {
      const form = new FormData();
      form.set('file', file);
      if (label) form.set('label', label);
      return api.labOrders.uploadFile(labOrderId, form);
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: clinicalKeys.labOrderFiles(v.labOrderId) }),
  });
}

export function useDeleteLabOrderFile(labOrderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => api.labOrders.deleteFile(labOrderId, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: clinicalKeys.labOrderFiles(labOrderId) }),
  });
}

export type { LabOrderFileRecord };
