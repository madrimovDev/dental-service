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

/** Run'ga singdirilgan refund-clawback tuzatishi (`GET /api/payroll/runs/:id/adjustments`). */
export type PayrollAdjustmentDto = {
  id: string;
  userId: string;
  amount: string;
  sourceTransactionId: string;
  sourceReceiptNumber: string | null;
  sourceCreatedAt: string;
  reason: 'refund_clawback';
};

/** Xodim bo'yicha tuzatish jamlanmasi (UI jadvalida «Tuzatish» ustuni). */
export type PayrollAdjustmentSummary = {
  total: number;
  items: { receiptNumber: string | null; date: string; amount: number }[];
};
