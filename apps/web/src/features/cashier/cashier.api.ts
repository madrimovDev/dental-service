import { listBranches, type ServiceWithPrices } from '@dental/api-client';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { cashierKeys } from './cashier.keys';

const todayISO = () => new Date().toISOString().slice(0, 10);

export function useTodayTransactions(branchId: string | null) {
  return useQuery({
    queryKey: cashierKeys.today(branchId ?? ''),
    queryFn: () => {
      const today = todayISO();
      return api.cashier.list({
        branchId: branchId ?? undefined,
        from: today,
        to: today,
        pageSize: 100,
      });
    },
    enabled: !!branchId,
  });
}

export function useDailySummary(branchId: string | null) {
  return useQuery({
    queryKey: cashierKeys.summary(branchId ?? ''),
    queryFn: () => api.cashier.dailySummary(branchId ?? '', todayISO()),
    enabled: !!branchId,
  });
}

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => listBranches().then((r) => r.data) });
}

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: api.services.list });
}

/** Lookup: barcha bemorlar (selektor uchun). */
export function usePatientsAll() {
  return useQuery({
    queryKey: ['patients', 'list-all'],
    queryFn: () => api.patients.list({ pageSize: 100 }),
  });
}

/** Tanlangan bemorning treatment-plan(lar)i. */
export function usePatientPlans(patientId: string | null) {
  return useQuery({
    queryKey: ['treatment-plans', 'by-patient', patientId ?? ''],
    queryFn: () => api.clinical.listPlans(patientId ?? undefined),
    enabled: !!patientId,
  });
}

/** Plan balans (bosqich paid/remaining). */
export function usePlanBalance(planId: string | null) {
  return useQuery({
    queryKey: cashierKeys.planBalance(planId ?? ''),
    queryFn: () => api.cashier.planBalance(planId ?? ''),
    enabled: !!planId,
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.cashier.create>[0]) => api.cashier.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: cashierKeys.all });
      // Plan billing → balans yangilanishi uchun.
      void qc.invalidateQueries({ queryKey: ['treatment-plans'] });
    },
  });
}

export function useRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cashier.refund(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: cashierKeys.all });
      // Refund allocation'larni negate qiladi → plan balans tiklanadi.
      void qc.invalidateQueries({ queryKey: ['treatment-plans'] });
    },
  });
}

/**
 * Xizmat narxini imperativ (one-shot) oladi — savatga qo'shilganda.
 * `service.get(id)` detail prices'ni cache'lab qaytaradi.
 */
export function fetchServicePrices(qc: QueryClient, id: string): Promise<ServiceWithPrices> {
  return qc.fetchQuery({
    queryKey: ['services', 'detail', id],
    queryFn: () => api.services.get(id),
  });
}
