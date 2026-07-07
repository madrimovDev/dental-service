import { describe, expect, it } from 'vitest';
import { computeNonPlanRemainder, computePatientBalance } from './patients.balance.ts';

describe('computePatientBalance', () => {
  it("bo'sh — hammasi 0", () => {
    expect(
      computePatientBalance({ stageCostSum: 0, allocationSum: 0, nonPlanRemainder: 0 }),
    ).toEqual({ balance: 0, planDebt: 0, nonPlanBalance: 0 });
  });

  it("faqat plan qarzi (to'lanmagan)", () => {
    const r = computePatientBalance({
      stageCostSum: 150000,
      allocationSum: 0,
      nonPlanRemainder: 0,
    });
    expect(r).toEqual({ balance: 150000, planDebt: 150000, nonPlanBalance: 0 });
  });

  it("qisman to'lov — plan qarzi kamayadi", () => {
    const r = computePatientBalance({
      stageCostSum: 150000,
      allocationSum: 40000,
      nonPlanRemainder: 0,
    });
    expect(r.planDebt).toBe(110000);
    expect(r.balance).toBe(110000);
  });

  it('refund negatsiyasi (manfiy allocation) qarzni tiklaydi', () => {
    // alloc 40000 + (-40000) = 0 → qarz to'liq tiklanadi
    const r = computePatientBalance({
      stageCostSum: 150000,
      allocationSum: 0,
      nonPlanRemainder: 0,
    });
    expect(r.balance).toBe(150000);
  });

  it('kredit — overpay manfiy balans beradi', () => {
    const r = computePatientBalance({
      stageCostSum: 100000,
      allocationSum: 120000,
      nonPlanRemainder: 0,
    });
    expect(r.planDebt).toBe(-20000);
    expect(r.balance).toBe(-20000);
  });

  it('faqat plansiz qoldiq', () => {
    const r = computePatientBalance({ stageCostSum: 0, allocationSum: 0, nonPlanRemainder: 60000 });
    expect(r).toEqual({ balance: 60000, planDebt: 0, nonPlanBalance: 60000 });
  });

  it('plan + plansiz aralash', () => {
    const r = computePatientBalance({
      stageCostSum: 150000,
      allocationSum: 40000,
      nonPlanRemainder: 30000,
    });
    expect(r.planDebt).toBe(110000);
    expect(r.nonPlanBalance).toBe(30000);
    expect(r.balance).toBe(140000);
  });
});

describe('computeNonPlanRemainder', () => {
  it("bo'sh massiv — 0", () => {
    expect(computeNonPlanRemainder([])).toBe(0);
  });

  it("to'liq to'langan, refundsiz — hissasi 0", () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 100000, refundedSum: 0 },
    ]);
    expect(result).toBe(0);
  });

  it("qisman to'langan, refundsiz — hissasi qarz", () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 60000, refundedSum: 0 },
    ]);
    expect(result).toBe(40000);
  });

  it("qisman to'langan (60/100), TO'LIQ refund qilingan (60) — hissasi 0 (CLI-448 fix)", () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 60000, refundedSum: 60000 },
    ]);
    expect(result).toBe(0);
  });

  it("to'liq to'langan (100/100), TO'LIQ refund qilingan (100) — hissasi 0", () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 100000, refundedSum: 100000 },
    ]);
    expect(result).toBe(0);
  });

  it('overpay (paidAmount > totalAmount), refundsiz — manfiy (kredit, CLI-451)', () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 120000, refundedSum: 0 },
    ]);
    expect(result).toBe(-20000);
  });

  it("bir necha qator — yig'indi to'g'ri", () => {
    const result = computeNonPlanRemainder([
      { totalAmount: 100000, paidAmount: 60000, refundedSum: 0 }, // 40000 qarz
      { totalAmount: 50000, paidAmount: 50000, refundedSum: 50000 }, // 0 (bekor)
      { totalAmount: 30000, paidAmount: 35000, refundedSum: 0 }, // -5000 kredit
    ]);
    expect(result).toBe(35000); // 40000 + 0 - 5000
  });
});
