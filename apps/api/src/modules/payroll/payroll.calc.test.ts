import { describe, expect, test } from 'bun:test';
import { computePayrollLine } from './payroll.calc.ts';

describe('computePayrollLine', () => {
  test('0-komissiya: faqat baza oylik', () => {
    expect(computePayrollLine(500000, 0, 0)).toEqual({ commissionAmount: 0, total: 500000 });
  });

  test('0-baza: faqat komissiya', () => {
    expect(computePayrollLine(0, 1000000, 10)).toEqual({
      commissionAmount: 100000,
      total: 100000,
    });
  });

  test('aralash: baza + komissiya', () => {
    expect(computePayrollLine(500000, 1000000, 10)).toEqual({
      commissionAmount: 100000,
      total: 600000,
    });
  });

  test('yaxlitlash: 2 kasr aniqlik', () => {
    expect(computePayrollLine(0, 333333, 10)).toEqual({
      commissionAmount: 33333.3,
      total: 33333.3,
    });
  });
});
