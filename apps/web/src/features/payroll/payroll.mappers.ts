import type { PayrollLine, PayrollRun } from '@dental/api-client';
import type { PayrollLineVM, PayrollRunVM } from './payroll.types';

/**
 * Payroll qator → VM (sof). String pul maydonlari → number;
 * xodim nomi `nameByUserId` xaritadan yechiladi, topilmasa `userId` (yoki '—').
 */
export function toPayrollLineVM(
  line: PayrollLine,
  nameByUserId: Map<string, string>,
): PayrollLineVM {
  const resolvedName = line.userId ? nameByUserId.get(line.userId) : undefined;
  return {
    id: line.id,
    userId: line.userId,
    employeeName: resolvedName ?? line.userId ?? '—',
    baseSalary: Number(line.baseSalary),
    attributedRevenue: Number(line.attributedRevenue),
    commissionPercent: Number(line.commissionPercent),
    commissionAmount: Number(line.commissionAmount),
    total: Number(line.total),
  };
}

/** Run → VM (ro'yxat qatori). */
export function toPayrollRunVM(run: PayrollRun): PayrollRunVM {
  return {
    id: run.id,
    periodFrom: run.periodFrom,
    periodTo: run.periodTo,
    status: run.status,
    createdAt: run.createdAt,
  };
}

/** Local (Tashkent) sana → YYYY-MM-DD; toISOString UTC siljishidan qochish. */
export function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
