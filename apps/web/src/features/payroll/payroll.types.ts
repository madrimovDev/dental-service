import type { PayrollRunStatus } from '@dental/api-client';

/** Payroll qator view-model — pul maydonlari number, xodim nomi yechilgan. */
export type PayrollLineVM = {
  id: string;
  userId: string | null;
  employeeName: string;
  baseSalary: number;
  attributedRevenue: number;
  commissionPercent: number;
  commissionAmount: number;
  total: number;
};

/** Run ro'yxati qatori (sana/status). */
export type PayrollRunVM = {
  id: string;
  periodFrom: string;
  periodTo: string;
  status: PayrollRunStatus;
  createdAt: string;
};
