import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
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
    queryFn: () => api.reports.revenue(toQuery(range)),
  });
}

export function useAppointmentStats(range: ReportRange) {
  return useQuery({
    queryKey: reportKeys.appointments(range),
    queryFn: () => api.reports.appointments(toQuery(range)),
  });
}

export function useDoctorWorkload(range: ReportRange) {
  return useQuery({
    queryKey: reportKeys.doctors(range),
    queryFn: () => api.reports.doctors(toQuery(range)),
  });
}

export function usePlanCompletion(range: ReportRange) {
  return useQuery({
    queryKey: reportKeys.planCompletion(range),
    queryFn: () => api.reports.treatmentPlans(toQuery(range)),
  });
}
