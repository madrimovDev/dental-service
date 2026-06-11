import { describe, expect, it } from 'vitest';
import { computePatientBalance } from './patients.balance.ts';

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
