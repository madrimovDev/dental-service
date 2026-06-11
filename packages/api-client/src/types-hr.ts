// R4 Guruh B — Xodim profili + Payroll

export type EmploymentStatus = 'active' | 'on_leave' | 'inactive';

export type StaffProfile = {
  id: string;
  tenantId: string;
  userId: string;
  specialty: string | null;
  employmentStatus: EmploymentStatus;
  startedAt: string | null;
  baseSalary: string;
  commissionPercent: string;
  createdAt: string;
  updatedAt: string;
};

export type PayrollRunStatus = 'draft' | 'finalized';

export type PayrollRun = {
  id: string;
  tenantId: string;
  periodFrom: string;
  periodTo: string;
  status: PayrollRunStatus;
  createdBy: string | null;
  createdAt: string;
};

export type PayrollLine = {
  id: string;
  tenantId: string;
  runId: string;
  userId: string | null;
  baseSalary: string;
  attributedRevenue: string;
  commissionPercent: string;
  commissionAmount: string;
  total: string;
  createdAt: string;
};

export type PayrollRunWithLines = PayrollRun & { lines: PayrollLine[] };
