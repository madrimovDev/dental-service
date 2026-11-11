import {
  customInstance,
  getAppointmentStatsReport,
  getDebtAgingReport,
  getDentalAnalyticsReport,
  getDoctorWorkloadReport,
  getOneCExport,
  getOwnerTodayReport,
  getPlanCompletionReport,
  getPnlReport,
  getRevenueReport,
} from '@dental/api-client';
import { useQuery } from '@tanstack/react-query';
import { reportKeys } from './reports.keys';
import type { ReportRange } from './reports.types';

export type ReportQueryOpts = { enabled?: boolean };

const toQuery = (range: ReportRange) => ({
  from: range.from,
  to: range.to,
  branchId: range.branchId || undefined,
});

export function useRevenueReport(range: ReportRange, opts: ReportQueryOpts = {}) {
  return useQuery({
    queryKey: reportKeys.revenue(range),
    queryFn: () => getRevenueReport(toQuery(range)).then((r) => r.data),
    enabled: opts.enabled ?? true,
  });
}

export function useAppointmentStats(range: ReportRange, opts: ReportQueryOpts = {}) {
  return useQuery({
    queryKey: reportKeys.appointments(range),
    queryFn: () => getAppointmentStatsReport(toQuery(range)).then((r) => r.data),
    enabled: opts.enabled ?? true,
  });
}

export function useDoctorWorkload(range: ReportRange, opts: ReportQueryOpts = {}) {
  return useQuery({
    queryKey: reportKeys.doctors(range),
    queryFn: () => getDoctorWorkloadReport(toQuery(range)).then((r) => r.data),
    enabled: opts.enabled ?? true,
  });
}

export function usePlanCompletion(range: ReportRange, opts: ReportQueryOpts = {}) {
  return useQuery({
    queryKey: reportKeys.planCompletion(range),
    queryFn: () => getPlanCompletionReport(toQuery(range)).then((r) => r.data),
    enabled: opts.enabled ?? true,
  });
}

export function useDentalAnalytics(range: ReportRange, opts: ReportQueryOpts = {}) {
  return useQuery({
    queryKey: reportKeys.dentalAnalytics(range),
    queryFn: () => getDentalAnalyticsReport(toQuery(range)).then((r) => r.data),
    enabled: opts.enabled ?? true,
  });
}

/** 1C eksport — faqat tugma bosilganda (enabled:false → refetch). */
export function useOneCExport(range: ReportRange) {
  return useQuery({
    queryKey: reportKeys.oneCExport(range),
    queryFn: () => getOneCExport(toQuery(range)).then((r) => r.data),
    enabled: false,
  });
}

/** Bugungi sof tushum (UI-M1 endpoint) — filial doirasi serverda; `branchId` ixtiyoriy. */
export function useOwnerTodayReport(branchId: string | undefined, opts: ReportQueryOpts = {}) {
  return useQuery({
    queryKey: reportKeys.ownerToday(branchId),
    queryFn: () => getOwnerTodayReport(branchId ? { branchId } : undefined).then((r) => r.data),
    enabled: opts.enabled ?? true,
    retry: false,
  });
}

/** Qarz muddati (UI-M1 endpoint) — tenant-darajali; filialga tayinlanganlarga 403. */
export function useDebtAgingReport(opts: ReportQueryOpts = {}) {
  return useQuery({
    queryKey: reportKeys.debtAging(),
    queryFn: () => getDebtAgingReport().then((r) => r.data),
    enabled: opts.enabled ?? true,
    retry: false,
  });
}

/** Foyda va zarar (FU-30) — mavjud `GET /api/reports/pnl`. */
export function usePnlReport(range: ReportRange, opts: ReportQueryOpts = {}) {
  return useQuery({
    queryKey: reportKeys.pnl(range),
    queryFn: () => getPnlReport(toQuery(range)).then((r) => r.data),
    enabled: opts.enabled ?? true,
  });
}

export type ReportBranches = {
  branches: { id: string; name: string }[];
  allowAllBranches: boolean;
};

/**
 * FU-31: hisobot filial tanlagichi — faqat `report.view` beradigan tayinlovlar filiallari.
 * TODO(generate): `generate:contract`dan keyin generated `getReportBranches`ga almashtiring.
 */
export function useReportBranches() {
  return useQuery({
    queryKey: reportKeys.branches(),
    queryFn: () =>
      customInstance<{ success: true; data: ReportBranches }>({
        url: '/api/reports/branches',
        method: 'GET',
      }).then((r) => r.data),
    retry: false,
  });
}
