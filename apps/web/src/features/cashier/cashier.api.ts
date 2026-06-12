import {
  createCashierTransaction,
  getCashierDailySummary,
  getCashierPlanBalance,
  getService,
  listBranches,
  listCashierTransactions,
  listPatients,
  listServices,
  listTreatmentPlans,
  refundCashierTransaction,
  type ServiceWithPrices,
} from '@dental/api-client';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cashierKeys } from './cashier.keys';

const todayISO = () => new Date().toISOString().slice(0, 10);

export function useTodayTransactions(branchId: string | null) {
  return useQuery({
    queryKey: cashierKeys.today(branchId ?? ''),
    queryFn: () => {
      const today = todayISO();
      return listCashierTransactions({
        branchId: branchId ?? undefined,
        from: today,
        to: today,
        pageSize: 100,
      }).then((r) => r.data);
    },
    enabled: !!branchId,
  });
}

export function useDailySummary(branchId: string | null) {
  return useQuery({
    queryKey: cashierKeys.summary(branchId ?? ''),
    queryFn: () =>
      getCashierDailySummary({ branchId: branchId ?? '', date: todayISO() }).then((r) => r.data),
    enabled: !!branchId,
  });
}

export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => listBranches().then((r) => r.data) });
}

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: () => listServices().then((r) => r.data) });
}

/** Lookup: barcha bemorlar (selektor uchun). */
export function usePatientsAll() {
  return useQuery({
    queryKey: ['patients', 'list-all'],
    queryFn: () => listPatients({ pageSize: 100 }).then((r) => r.data),
  });
}

/** Tanlangan bemorning treatment-plan(lar)i. */
export function usePatientPlans(patientId: string | null) {
  return useQuery({
    queryKey: ['treatment-plans', 'by-patient', patientId ?? ''],
    queryFn: () => listTreatmentPlans(patientId ? { patientId } : undefined).then((r) => r.data),
    enabled: !!patientId,
  });
}

/** Plan balans (bosqich paid/remaining). */
export function usePlanBalance(planId: string | null) {
  return useQuery({
    queryKey: cashierKeys.planBalance(planId ?? ''),
    queryFn: () => getCashierPlanBalance(planId ?? '').then((r) => r.data),
    enabled: !!planId,
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof createCashierTransaction>[0]) =>
      createCashierTransaction(body).then((r) => r.data),
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
    mutationFn: (id: string) => refundCashierTransaction(id).then((r) => r.data),
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
    queryFn: () => getService(id).then((r) => r.data),
  });
}
