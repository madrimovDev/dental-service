import {
  createCashierTransaction,
  customInstance,
  getCashierDailySummary,
  getCashierPlanBalance,
  getCashierTransaction,
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
import { patientKeys } from '@/features/patients/patients.keys';
import { serviceKeys } from '@/features/services/services.keys';
import { lookupKeys } from '@/lib/lookup-keys';
import { useAuthStore } from '@/stores/auth-store.ts';
import { cashierKeys } from './cashier.keys';
import type { PendingVisit } from './cashier.types';

/**
 * CLI-440 #2: Asia/Tashkent kalendar kuni (UTC EMAS — `new Date().toISOString().slice(0,10)`
 * Tashkent 00:00–05:00 oralig'ida hali "kecha"gi UTC sanani berardi, backend esa kun
 * chegarasini `+05:00`da quradi — "bugungi" ro'yxat/summary noto'g'ri kunni ko'rsatardi).
 * `schedule.mappers.localDateParam` bilan bir xil naqsh (`Intl.DateTimeFormat('en-CA', ...)`).
 */
const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());

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

/**
 * Lookup: bemorlar (selektor uchun). CLI-454: `search` — debounced server-side
 * qidiruv; ro'yxat endi oxirgi 100 yozuv bilan cheklanmaydi (backend `ilike` filtri
 * bilan qidiradi, `pageSize:100` faqat natija sahifasi hajmi).
 */
export function usePatientsAll(search = '') {
  return useQuery({
    queryKey: lookupKeys.patientsAll(search),
    queryFn: () => listPatients({ search: search || undefined, pageSize: 100 }).then((r) => r.data),
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
    // `visitNoteId` (FX-handoff) generated body'da regeneratsiyagacha yo'q.
    mutationFn: (body: Parameters<typeof createCashierTransaction>[0] & { visitNoteId?: string }) =>
      createCashierTransaction(body).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: cashierKeys.all });
      // Plan billing → balans yangilanishi uchun.
      void qc.invalidateQueries({ queryKey: cashierKeys.plans });
      // CLI-440 #2: to'lov bemor balansini o'zgartiradi — ro'yxat/detal balans
      // ustunlari eskirib qolmasligi uchun `patients` keyni ham invalidate qilamiz.
      void qc.invalidateQueries({ queryKey: patientKeys.all });
    },
  });
}

/**
 * Chek serverdan chiziladi: bitta tranzaksiya + items (`GET /cashier/transactions/:id`).
 * Server qatorlari/fiskal holati/sub-turi manba — local savat snapshot'i emas.
 */
export function useTransactionDetail(id: string | null, enabled = true) {
  return useQuery({
    queryKey: cashierKeys.detail(id ?? ''),
    queryFn: () => getCashierTransaction(id ?? '').then((r) => r.data),
    enabled: !!id && enabled,
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
      // CLI-440 #2: refund ham bemor balansini o'zgartiradi (patients.api'dagi
      // xuddi shu naqsh — clinical.api.ts `invalidatePlanFinancials`).
      void qc.invalidateQueries({ queryKey: patientKeys.all });
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

/**
 * Bugun imzolangan, hali to'lanmagan vizitlar (`GET /cashier/pending-visits`, `cashier.view`).
 * TODO(integratsiya): `generate:contract`dan keyin generated `listCashierPendingVisits`ga
 * almashtiring (bu lane generate qilmaydi). Kassa/«Bugun» ochiq turganda 30 s da yangilanadi.
 */
export function usePendingVisits(branchId: string | null) {
  const { hasPermission } = useAuthStore();
  return useQuery({
    queryKey: cashierKeys.pendingVisits(branchId ?? ''),
    queryFn: () =>
      customInstance<{ data: PendingVisit[] }>({
        url: '/api/cashier/pending-visits',
        method: 'GET',
        params: { branchId },
      }).then((r) => r.data),
    enabled: !!branchId && hasPermission('cashier.view'),
    refetchInterval: 30_000,
  });
}
