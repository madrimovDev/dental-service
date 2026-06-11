import { describe, expect, it } from 'bun:test';
import { computePlanBalance } from './cashier.billing.ts';

// Drizzle numeric'ni string qaytaradi — test real DB shaklini aks ettiradi.
const stages = [
  { id: 's1', serviceName: 'Konsultatsiya', cost: '100000.00' },
  { id: 's2', serviceName: 'Plomba', cost: '300000.00' },
];

describe('computePlanBalance', () => {
  it("to'lovsiz: paid=0, remaining=cost, balance=totalCost", () => {
    const r = computePlanBalance(stages, []);
    expect(r.totalCost).toBe(400000);
    expect(r.totalPaid).toBe(0);
    expect(r.balance).toBe(400000);
    const s1 = r.stages.find((s) => s.stageId === 's1');
    expect(s1).toEqual({
      stageId: 's1',
      serviceName: 'Konsultatsiya',
      cost: 100000,
      paid: 0,
      remaining: 100000,
    });
  });

  it("bitta bosqich to'liq to'langan", () => {
    const r = computePlanBalance(stages, [{ stageId: 's1', amount: '100000.00' }]);
    expect(r.totalPaid).toBe(100000);
    expect(r.balance).toBe(300000);
    expect(r.stages.find((s) => s.stageId === 's1')?.remaining).toBe(0);
    expect(r.stages.find((s) => s.stageId === 's2')?.remaining).toBe(300000);
  });

  it("qisman to'lov: bir bosqichga bir nechta allocation yig'iladi", () => {
    const r = computePlanBalance(stages, [
      { stageId: 's2', amount: '100000.00' },
      { stageId: 's2', amount: '50000.00' },
    ]);
    const s2 = r.stages.find((s) => s.stageId === 's2');
    expect(s2?.paid).toBe(150000);
    expect(s2?.remaining).toBe(150000);
    expect(r.totalPaid).toBe(150000);
    expect(r.balance).toBe(250000);
  });

  it("multi-stage: bir tranzaksiya bir necha bosqichni to'laydi", () => {
    const r = computePlanBalance(stages, [
      { stageId: 's1', amount: '100000.00' },
      { stageId: 's2', amount: '300000.00' },
    ]);
    expect(r.totalPaid).toBe(400000);
    expect(r.balance).toBe(0);
  });

  it('refund negatsiyasi: manfiy allocation balansni tiklaydi', () => {
    const r = computePlanBalance(stages, [
      { stageId: 's1', amount: '100000.00' },
      { stageId: 's1', amount: '-100000.00' },
    ]);
    const s1 = r.stages.find((s) => s.stageId === 's1');
    expect(s1?.paid).toBe(0);
    expect(s1?.remaining).toBe(100000);
    expect(r.totalPaid).toBe(0);
    expect(r.balance).toBe(400000);
  });

  it("noma'lum stage_id allocation'i e'tiborga olinmaydi (plan bosqichlari manba)", () => {
    const r = computePlanBalance(stages, [{ stageId: 'ghost', amount: '50000.00' }]);
    expect(r.totalPaid).toBe(0);
    expect(r.balance).toBe(400000);
  });
});
