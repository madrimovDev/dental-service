import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { payrollKeys } from './payroll.keys';

/** Run ro'yxati (sana/status). */
export function usePayrollRuns() {
  return useQuery({
    queryKey: payrollKeys.runs(),
    queryFn: () => api.payroll.runs(),
  });
}

/** Run detali (run + lines). `id` null bo'lsa o'chiq. */
export function usePayrollRun(id: string | null) {
  return useQuery({
    queryKey: payrollKeys.run(id ?? ''),
    queryFn: () => api.payroll.getRun(id ?? ''),
    enabled: !!id,
  });
}

/** Yangi run yaratish (draft, snapshot lines bilan). */
export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { periodFrom: string; periodTo: string }) => api.payroll.createRun(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: payrollKeys.all });
    },
  });
}

/**
 * Run finalize (status → finalized).
 * ⚠️ Javob faqat `PayrollRun` (lines YO'Q) — cache'ga to'g'ridan yozilmaydi,
 * aks holda detaldagi lines o'chib ketadi. Invalidate → getRun lines bilan qayta yuklaydi.
 */
export function useFinalizeRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.payroll.finalize(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: payrollKeys.all });
    },
  });
}
