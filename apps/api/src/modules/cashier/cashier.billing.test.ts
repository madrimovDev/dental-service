import { describe, expect, it } from 'bun:test';
import {
  computePlanBalance,
  distributeRefundNegations,
  fromCents,
  toCents,
} from './cashier.billing.ts';

describe('toCents / fromCents (CLI-453 #4 — sent-asosidagi arifmetika, distributeRefundNegations uslubi)', () => {
  it("butun so'm — round-trip aynan", () => {
    expect(toCents(100000)).toBe(10000000);
    expect(fromCents(10000000)).toBe(100000);
  });

  it('kasr summa (0.1) — sentga aylantirilganda butun son', () => {
    expect(toCents(0.1)).toBe(10);
    expect(fromCents(10)).toBe(0.1);
  });

  it("uch marta 33333.33 — sentlarda yig'indi aniq (9999999), float drift yo'q", () => {
    const cents = toCents(33333.33) * 3;
    expect(cents).toBe(9999999);
    expect(fromCents(cents)).toBe(99999.99);
  });

  it('0 — round-trip 0', () => {
    expect(toCents(0)).toBe(0);
    expect(fromCents(0)).toBe(0);
  });
});

describe('distributeRefundNegations (CLI-418)', () => {
  const sum = (rows: { amount: string }[]) => rows.reduce((s, r) => s + Number(r.amount), 0);

  it("3000 (1000/1000/1000), refund 1000 → Σ = aynan -1000 (drift yo'q)", () => {
    const allocs = [
      { stageId: 'a', amount: '1000.00' },
      { stageId: 'b', amount: '1000.00' },
      { stageId: 'c', amount: '1000.00' },
    ];
    const neg = distributeRefundNegations(allocs, 1000, 3000);
    // Har biri ~-333.33, oxirgisi residue bilan → Σ = -1000.00 aynan.
    expect(sum(neg)).toBeCloseTo(-1000, 2);
    // Har amount 2dp (numeric(14,2) xavfsiz).
    for (const n of neg) expect(Number(n.amount) * 100).toBe(Math.round(Number(n.amount) * 100));
  });

  it("to'liq refund (factor=1) → har stage aynan -amount", () => {
    const allocs = [
      { stageId: 'a', amount: '1000.00' },
      { stageId: 'b', amount: '500.00' },
    ];
    const neg = distributeRefundNegations(allocs, 1500, 1500);
    expect(sum(neg)).toBeCloseTo(-1500, 2);
  });

  it('qisman split 1000/500, refund 1000 (factor 2/3) → Σ = -1000', () => {
    const allocs = [
      { stageId: 'a', amount: '1000.00' },
      { stageId: 'b', amount: '500.00' },
    ];
    const neg = distributeRefundNegations(allocs, 1000, 1500);
    expect(sum(neg)).toBeCloseTo(-1000, 2);
  });

  it('bo‘sh allocation → bo‘sh natija', () => {
    expect(distributeRefundNegations([], 1000, 1000)).toEqual([]);
  });
});

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
      excludedFromDebt: false,
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

  // CLI-185 — Qaror #24: skipped bosqich cost'i 0, lekin allocation'i SAQLANADI
  // (ghost-allocation tuzog'i: bosqichni ro'yxatdan o'chirsang to'lov yo'qoladi).
  it("skipped bosqich totalCost'ga kirmaydi (to'lovsiz)", () => {
    const withStatus = [
      { id: 's1', serviceName: 'Konsultatsiya', cost: '100000.00', status: 'skipped' as const },
      { id: 's2', serviceName: 'Plomba', cost: '300000.00' },
    ];
    const r = computePlanBalance(withStatus, []);
    expect(r.totalCost).toBe(300000); // s1 (skipped) chiqarildi
    const s1 = r.stages.find((s) => s.stageId === 's1');
    expect(s1?.excludedFromDebt).toBe(true);
    expect(s1?.remaining).toBe(0); // cost 0, paid 0
  });

  it("skip-after-pay: skipped bosqich allocation'i SAQLANADI → manfiy balans (kredit)", () => {
    const withStatus = [
      { id: 's1', serviceName: 'Konsultatsiya', cost: '100000.00', status: 'skipped' as const },
      { id: 's2', serviceName: 'Plomba', cost: '300000.00' },
    ];
    // s1 to'langan, keyin skip qilingan; s2 ham to'liq to'langan → faqat s1 kredit qoladi
    const r = computePlanBalance(withStatus, [
      { stageId: 's1', amount: '100000.00' },
      { stageId: 's2', amount: '300000.00' },
    ]);
    expect(r.totalCost).toBe(300000); // s1 cost chiqarildi, s2=300000
    expect(r.totalPaid).toBe(400000); // s1+s2 to'lovi SAQLANDI (s1 yo'qolmadi)
    expect(r.balance).toBe(-100000); // s1 kredit (refundga loyiq), 0 yoki qarz emas
    const s1 = r.stages.find((s) => s.stageId === 's1');
    expect(s1?.excludedFromDebt).toBe(true);
    expect(s1?.paid).toBe(100000);
    expect(s1?.remaining).toBe(-100000); // 0 − 100000
  });

  it("normal (status'siz/pending) bosqich xulqi o'zgarmaydi", () => {
    const r = computePlanBalance(stages, [{ stageId: 's1', amount: '100000.00' }]);
    expect(r.totalCost).toBe(400000);
    expect(r.balance).toBe(300000);
    expect(r.stages.find((s) => s.stageId === 's1')?.excludedFromDebt).toBe(false);
  });

  // ─── CLI-221 / C4 — acceptance axis (Qaror #25). Qarz cost faqat acceptance='accepted'.
  // ASIMMETRIYA: acceptance undefined ⇒ qarzga KIRADI (M9 fixture'lar buzilmaydi); ishlab
  // chiqarishda rowlar doim haqiqiy enum qiymatga ega. Allocation HECH QACHON filtrlanmaydi.

  it('accepted bosqich qarzga kiradi (xuddi status undefined kabi)', () => {
    const withAcc = [
      { id: 's1', serviceName: 'A', cost: '100000.00', acceptance: 'accepted' as const },
    ];
    const r = computePlanBalance(withAcc, []);
    expect(r.totalCost).toBe(100000);
    expect(r.stages[0]?.excludedFromDebt).toBe(false);
  });

  it('proposed bosqich qarz COST chiqariladi (hali qabul qilinmagan)', () => {
    const withAcc = [
      { id: 's1', serviceName: 'A', cost: '100000.00', acceptance: 'proposed' as const },
      { id: 's2', serviceName: 'B', cost: '300000.00', acceptance: 'accepted' as const },
    ];
    const r = computePlanBalance(withAcc, []);
    expect(r.totalCost).toBe(300000); // s1 (proposed) chiqarildi
    expect(r.stages.find((s) => s.stageId === 's1')?.excludedFromDebt).toBe(true);
    expect(r.stages.find((s) => s.stageId === 's2')?.excludedFromDebt).toBe(false);
  });

  it('rejected bosqich qarz cost chiqariladi', () => {
    const withAcc = [
      { id: 's1', serviceName: 'A', cost: '100000.00', acceptance: 'rejected' as const },
    ];
    const r = computePlanBalance(withAcc, []);
    expect(r.totalCost).toBe(0);
    expect(r.stages[0]?.excludedFromDebt).toBe(true);
  });

  it("reject-after-pay: rejected bosqich allocation'i SAQLANADI → kredit", () => {
    const withAcc = [
      { id: 's1', serviceName: 'A', cost: '100000.00', acceptance: 'rejected' as const },
    ];
    const r = computePlanBalance(withAcc, [{ stageId: 's1', amount: '100000.00' }]);
    expect(r.totalCost).toBe(0); // rejected cost chiqarildi
    expect(r.totalPaid).toBe(100000); // to'lov SAQLANDI
    expect(r.balance).toBe(-100000); // kredit (refundga loyiq)
    expect(r.stages[0]?.excludedFromDebt).toBe(true);
    expect(r.stages[0]?.remaining).toBe(-100000);
  });

  it("non-debt plan status (presented) qarz COST'ni butunlay 0 qiladi", () => {
    const withAcc = [
      { id: 's1', serviceName: 'A', cost: '100000.00', acceptance: 'accepted' as const },
    ];
    // accepted bosqich, lekin plan hali presented → qarz YO'Q (3 konjunkt birgalikda).
    const r = computePlanBalance(withAcc, [], 'presented');
    expect(r.totalCost).toBe(0);
    expect(r.stages[0]?.excludedFromDebt).toBe(true);
  });

  it('debt plan status (accepted) + accepted bosqich → qarz', () => {
    const withAcc = [
      { id: 's1', serviceName: 'A', cost: '100000.00', acceptance: 'accepted' as const },
    ];
    const r = computePlanBalance(withAcc, [], 'accepted');
    expect(r.totalCost).toBe(100000);
    expect(r.stages[0]?.excludedFromDebt).toBe(false);
  });

  it("cancelled plan reject-after-pay: cost 0, to'lov saqlanadi → kredit", () => {
    const withAcc = [
      { id: 's1', serviceName: 'A', cost: '100000.00', acceptance: 'accepted' as const },
    ];
    const r = computePlanBalance(withAcc, [{ stageId: 's1', amount: '100000.00' }], 'cancelled');
    expect(r.totalCost).toBe(0); // cancelled plan → cost chiqarildi
    expect(r.totalPaid).toBe(100000); // allocation saqlandi
    expect(r.balance).toBe(-100000);
  });

  it('planStatus undefined ⇒ debt-eligible (asimmetriya saqlanadi)', () => {
    const withAcc = [
      { id: 's1', serviceName: 'A', cost: '100000.00', acceptance: 'accepted' as const },
    ];
    const r = computePlanBalance(withAcc, []); // planStatus berilmagan
    expect(r.totalCost).toBe(100000);
  });
});
