import {
  createCashierTransaction,
  getCashierDailySummary,
  getCashierPlanBalance,
  getService,
  listBranches,
  listCashierPatientPlans,
  listCashierTransactions,
  listPatients,
  listServices,
  refundCashierTransaction,
  type ServiceWithPrices,
} from '@dental/api-client';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serviceKeys } from '@/features/services/services.keys';
import { lookupKeys } from '@/lib/lookup-keys';
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
  return useQuery({
    queryKey: lookupKeys.branches(),
    queryFn: () => listBranches().then((r) => r.data),
  });
}

export function useServices() {
  return useQuery({
    queryKey: lookupKeys.services(),
    queryFn: () => listServices().then((r) => r.data),
  });
}

/** Lookup: barcha bemorlar (selektor uchun). */
export function usePatientsAll() {
  return useQuery({
    queryKey: lookupKeys.patientsAll(),
    queryFn: () => listPatients({ pageSize: 100 }).then((r) => r.data),
  });
}

/**
 * Tanlangan bemorning rejalari — yengil `GET /cashier/patient-plans` (`cashier.view`).
 * Avval `GET /treatment-plans` (`medical_record.view`) ishlatilardi — kassa rollarida
 * o'sha ruxsat yo'q → 403 → "reja yo'q" yanglish UI (CLI-155). Balans alohida
 * `usePlanBalance` (ham `cashier.view`) orqali olinadi.
 */
export function usePatientPlans(patientId: string | null) {
  return useQuery({
    queryKey: cashierKeys.patientPlans(patientId ?? ''),
    queryFn: () => listCashierPatientPlans({ patientId: patientId ?? '' }).then((r) => r.data),
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
      void qc.invalidateQueries({ queryKey: cashierKeys.plans });
    },
  });
}

export function useRefund() {
  const qc = useQueryClient();
  return useMutation({
    // amount yo'q = to'liq refund; berilsa = qisman (faqat plan-linked, backend tekshiradi).
    mutationFn: ({ id, amount }: { id: string; amount?: number }) =>
      refundCashierTransaction(id, amount != null ? { amount } : {}).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: cashierKeys.all });
      // Refund allocation'larni negate qiladi → plan balans tiklanadi.
      void qc.invalidateQueries({ queryKey: cashierKeys.plans });
    },
  });
}

/**
 * Xizmat narxini imperativ (one-shot) oladi — savatga qo'shilganda.
 * `service.get(id)` detail prices'ni cache'lab qaytaradi.
 */
export function fetchServicePrices(qc: QueryClient, id: string): Promise<ServiceWithPrices> {
  return qc.fetchQuery({
    queryKey: serviceKeys.detail(id),
    queryFn: () => getService(id).then((r) => r.data),
  });
}

export function useAllTransactions() {
  return useQuery({
    queryKey: cashierKeys.allTransactions(),
    queryFn: () => listCashierTransactions().then((r) => r.data),
  });
}
