import type { PayrollLine, PayrollRun } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import { toLocalDate, toPayrollLineVM, toPayrollRunVM } from './payroll.mappers';

function line(over: Partial<PayrollLine> = {}): PayrollLine {
  return {
    id: 'l1',
    tenantId: 't',
    runId: 'r1',
    userId: 'u1',
    baseSalary: '500000',
    attributedRevenue: '1000000',
    commissionPercent: '10',
    commissionAmount: '100000',
    total: '600000',
    createdAt: '2026-06-11T05:00:00Z',
    ...over,
  };
}

describe('toPayrollLineVM', () => {
  it('barcha 5 pul maydoni string → number', () => {
    const vm = toPayrollLineVM(line(), new Map([['u1', 'Dr. Ali']]));
    expect(vm.baseSalary).toBe(500000);
    expect(vm.attributedRevenue).toBe(1000000);
    expect(vm.commissionPercent).toBe(10);
    expect(vm.commissionAmount).toBe(100000);
    expect(vm.total).toBe(600000);
  });

  it('xodim nomi xaritadan yechiladi', () => {
    const vm = toPayrollLineVM(line({ userId: 'u1' }), new Map([['u1', 'Dr. Ali']]));
    expect(vm.employeeName).toBe('Dr. Ali');
  });

  it("nom topilmasa userId'ga tushadi", () => {
    const vm = toPayrollLineVM(line({ userId: 'u9' }), new Map([['u1', 'Dr. Ali']]));
    expect(vm.employeeName).toBe('u9');
  });

  it("userId null bo'lsa '—'", () => {
    const vm = toPayrollLineVM(line({ userId: null }), new Map());
    expect(vm.employeeName).toBe('—');
    expect(vm.userId).toBeNull();
  });

  it('kasrli string ham number', () => {
    const vm = toPayrollLineVM(line({ commissionAmount: '33333.3' }), new Map());
    expect(vm.commissionAmount).toBeCloseTo(33333.3);
  });
});

describe('toPayrollRunVM', () => {
  it('run → VM (sana/status)', () => {
    const run: PayrollRun = {
      id: 'r1',
      tenantId: 't',
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
      status: 'draft',
      createdBy: 'u1',
      createdAt: '2026-06-11T05:00:00Z',
    };
    expect(toPayrollRunVM(run)).toEqual({
      id: 'r1',
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
      status: 'draft',
      createdAt: '2026-06-11T05:00:00Z',
    });
  });
});

describe('toLocalDate', () => {
  it('local sana → YYYY-MM-DD (UTC siljishsiz)', () => {
    // 2026-06-11 mahalliy — toISOString UTC'ga o'tsa kun siljishi mumkin.
    const d = new Date(2026, 5, 11, 23, 30);
    expect(toLocalDate(d)).toBe('2026-06-11');
  });
});
