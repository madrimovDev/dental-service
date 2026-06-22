import type { ReportRange } from './reports.types';

export const reportKeys = {
  all: ['reports'] as const,
  revenue: (range: ReportRange) => ['reports', 'revenue', range] as const,
  appointments: (range: ReportRange) => ['reports', 'appointments', range] as const,
  doctors: (range: ReportRange) => ['reports', 'doctors', range] as const,
  planCompletion: (range: ReportRange) => ['reports', 'planCompletion', range] as const,
  dentalAnalytics: (range: ReportRange) => ['reports', 'dentalAnalytics', range] as const,
};
