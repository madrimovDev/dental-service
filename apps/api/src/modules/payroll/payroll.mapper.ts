import type { PayrollLine, PayrollRun } from '@dental/db-schema';
import type { PayrollLineDto, PayrollRunDto, PayrollRunWithLinesDto } from './payroll.schema.ts';

/** DB PayrollLine row → wire DTO (createdAt Date → ISO string; money fields already string). */
export const toPayrollLineDto = (row: PayrollLine): PayrollLineDto => ({
  id: row.id,
  tenantId: row.tenantId,
  runId: row.runId,
  userId: row.userId ?? null,
  baseSalary: row.baseSalary,
  attributedRevenue: row.attributedRevenue,
  commissionPercent: row.commissionPercent,
  commissionAmount: row.commissionAmount,
  total: row.total,
  createdAt: row.createdAt.toISOString(),
});

/** DB PayrollRun row → wire DTO (createdAt Date → ISO string; date fields already string). */
export const toPayrollRunDto = (row: PayrollRun): PayrollRunDto => ({
  id: row.id,
  tenantId: row.tenantId,
  periodFrom: row.periodFrom,
  periodTo: row.periodTo,
  status: row.status,
  createdBy: row.createdBy ?? null,
  createdAt: row.createdAt.toISOString(),
});

/** DB PayrollRun row + lines → wire DTO with nested snapshot lines. */
export const toPayrollRunWithLinesDto = (
  row: PayrollRun,
  lines: PayrollLine[],
): PayrollRunWithLinesDto => ({
  ...toPayrollRunDto(row),
  lines: lines.map(toPayrollLineDto),
});
