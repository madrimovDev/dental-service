import {
  createPayrollRun,
  finalizePayrollRun,
  getPayrollRun,
  listPayrollRuns,
  listUserAssignments,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { payrollKeys } from './payroll.keys';

/**
 * UserId → ism xaritasi uchun (payroll line faqat userId tashiydi).
 * `['users', 'assignments']` key audit feature bilan bir xil — cache bo'lishiladi.
 */
export function useUserAssignments() {
  return useQuery({
    queryKey: ['users', 'assignments'],
    queryFn: () => listUserAssignments().then((r) => r.data),
  });
}

/** Run ro'yxati (sana/status). */
export function usePayrollRuns() {
  return useQuery({
    queryKey: payrollKeys.runs(),
    queryFn: () => listPayrollRuns().then((r) => r.data),
  });
}

/** Run detali (run + lines). `id` null bo'lsa o'chiq. */
export function usePayrollRun(id: string | null) {
  return useQuery({
    queryKey: payrollKeys.run(id ?? ''),
    queryFn: () => getPayrollRun(id ?? '').then((r) => r.data),
    enabled: !!id,
  });
}

/** Yangi run yaratish (draft, snapshot lines bilan). */
export function useCreateRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { periodFrom: string; periodTo: string }) =>
      createPayrollRun(body).then((r) => r.data),
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
    mutationFn: (id: string) => finalizePayrollRun(id).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: payrollKeys.all });
    },
  });
}
