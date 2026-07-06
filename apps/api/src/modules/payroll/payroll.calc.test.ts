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

  test("CLI-446: og'ir refund davri — manfiy attributedRevenue floor qilinadi 0gacha", () => {
    // baza=0, revenue=-1000000 (refund > sotuv), percent=10 → xom komissiya -100000,
    // lekin manfiy oylik/komissiya biznes ma'noga ega emas — 0'da floor.
    expect(computePayrollLine(0, -1000000, 10)).toEqual({
      commissionAmount: 0,
      total: 0,
    });
  });

  test('CLI-446: manfiy komissiya bazani "yesa" ham total 0dan past tushmaydi', () => {
    // baza=50000, revenue=-1000000, percent=10 → xom komissiya -100000, xom total -50000
    // → floor: commissionAmount 0da to'xtaydi, total ham 0dan past emas.
    expect(computePayrollLine(50000, -1000000, 10)).toEqual({
      commissionAmount: 0,
      total: 50000,
    });
  });
});
