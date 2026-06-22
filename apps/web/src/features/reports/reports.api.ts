import {
  getAppointmentStatsReport,
  getDentalAnalyticsReport,
  getDoctorWorkloadReport,
  getPlanCompletionReport,
  getRevenueReport,
} from '@dental/api-client';
import { useQuery } from '@tanstack/react-query';
import { reportKeys } from './reports.keys';
import type { ReportRange } from './reports.types';

const toQuery = (range: ReportRange) => ({
  from: range.from,
  to: range.to,
  branchId: range.branchId || undefined,
});

export function useRevenueReport(range: ReportRange) {
  return useQuery({
    queryKey: reportKeys.revenue(range),
    queryFn: () => getRevenueReport(toQuery(range)).then((r) => r.data),
  });
}

export function useAppointmentStats(range: ReportRange) {
  return useQuery({
    queryKey: reportKeys.appointments(range),
    queryFn: () => getAppointmentStatsReport(toQuery(range)).then((r) => r.data),
  });
}

export function useDoctorWorkload(range: ReportRange) {
  return useQuery({
    queryKey: reportKeys.doctors(range),
    queryFn: () => getDoctorWorkloadReport(toQuery(range)).then((r) => r.data),
  });
}

export function usePlanCompletion(range: ReportRange) {
  return useQuery({
    queryKey: reportKeys.planCompletion(range),
    queryFn: () => getPlanCompletionReport(toQuery(range)).then((r) => r.data),
  });
}

export function useDentalAnalytics(range: ReportRange) {
  return useQuery({
    queryKey: reportKeys.dentalAnalytics(range),
    queryFn: () => getDentalAnalyticsReport(toQuery(range)).then((r) => r.data),
  });
}
