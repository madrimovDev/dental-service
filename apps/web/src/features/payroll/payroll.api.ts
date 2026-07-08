import {
  createPayrollRun,
  finalizePayrollRun,
  getPayrollRun,
  listPayrollRuns,
  listPayrollStaffNames,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { payrollKeys } from './payroll.keys';

/**
 * UserId → ism xaritasi uchun (payroll line faqat userId tashiydi).
 *
 * CLI-470: avval `useUserAssignments()` (`GET /users/assignments`, `user.view`)
 * ishlatilardi — Accountant rol shabloni `payroll.view`/`payroll.manage`ga ega,
 * `user.view`ga EGA EMAS → Payroll ekranini ochganda bu so'rov jim 403 yeb,
 * xodim ismlari o'rniga bo'sh/ID ko'rinardi (CLI-153/154/155 bilan bir xil
 * takrorlanuvchi cross-domen RBAC gap pattern). Fix: yengil `payroll.view`-gated
 * `GET /payroll/staff-names` — `fullName` allaqachon backendda resolve qilingan
 * (bo'sh bo'lsa `phone`ga fallback qilingan, `listDoctors` bilan bir xil pattern).
 */
export function useStaffNames() {
  return useQuery({
    queryKey: payrollKeys.staffNames(),
    queryFn: () => listPayrollStaffNames().then((r) => r.data),
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
