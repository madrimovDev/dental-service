import type { CreateRecall, UpdateRecall } from '@dental/api-client';
import {
  createRecall,
  listPatientRecalls,
  listRecalls,
  markRecallContacted,
  updateRecall,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { recallKeys } from './recalls.keys';
import type { RecallListParams } from './recalls.types';

/**
 * Recall ro'yxati — `recall.view`. `date` berilsa shu kunga (yoki undan oldin)
 * to'g'ri keluvchi pending recall'lar; `date`siz BARCHA pending qaytadi.
 * Dashboard "bugun" ko'rinishi `date`ni (bugun, Tashkent) berishi shart.
 */
export function useRecalls(params: RecallListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: recallKeys.list(params),
    enabled: options?.enabled ?? true,
    queryFn: () => listRecalls(params).then((r) => r.data),
  });
}

/** Bemorning barcha recall'lari (har statusda) — `recall.view`. */
export function usePatientRecalls(patientId: string) {
  return useQuery({
    queryKey: recallKeys.patient(patientId),
    enabled: !!patientId,
    queryFn: () => listPatientRecalls(patientId).then((r) => r.data),
  });
}

/** Recall yaratish (qo'lda) — `recall.manage`. */
export function useCreateRecall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRecall) => createRecall(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: recallKeys.all }),
  });
}

/** Recall yangilash (status/dueDate/...) — `recall.manage`. */
export function useUpdateRecall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRecall }) =>
      updateRecall(id, body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: recallKeys.all }),
  });
}

/** Recall "bog'lanildi" deb belgilash — `recall.manage`. */
export function useMarkRecallContacted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      markRecallContacted(id, { notes }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: recallKeys.all }),
  });
}
