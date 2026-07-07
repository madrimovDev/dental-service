import { describe, expect, it, test } from 'bun:test';
import {
  branchOpenMinutes,
  comparisonEntry,
  completionRate,
  computeServiceMargin,
  DEFAULT_WORK_MINUTES,
  deltaPct,
  materialCostByService,
  noShowRate,
  periodLengthDays,
  recallEfficacy,
  retentionRate,
  shiftDays,
  shiftYears,
  utilizationPct,
} from './reports.aggregations.ts';

describe('reports.aggregations', () => {
  it('noShowRate', () => {
    expect(noShowRate(2, 10)).toBe(0.2);
    expect(noShowRate(0, 0)).toBe(0);
  });
  it('utilizationPct: clamp va 0-division', () => {
    expect(utilizationPct(270, 540)).toBe(0.5);
    expect(utilizationPct(600, 540)).toBe(1); // clamp
    expect(utilizationPct(100, 0)).toBe(0);
  });
  it('completionRate', () => {
    expect(completionRate(3, 4)).toBe(0.75);
    expect(completionRate(0, 0)).toBe(0);
  });
  it('recallEfficacy (V2-3)', () => {
    expect(recallEfficacy(3, 10)).toBe(0.3);
    expect(recallEfficacy(0, 0)).toBe(0);
  });
  it('retentionRate (V2-3)', () => {
    expect(retentionRate(6, 4)).toBe(0.6); // qaytgan/(qaytgan+yangi)
    expect(retentionRate(0, 0)).toBe(0);
  });
  it('branchOpenMinutes', () => {
    const wh = { mon: { open: '09:00', close: '18:00' }, sun: null };
    expect(branchOpenMinutes(wh, 'mon', DEFAULT_WORK_MINUTES)).toBe(540);
    expect(branchOpenMinutes(wh, 'sun', DEFAULT_WORK_MINUTES)).toBe(0); // yopiq
    expect(branchOpenMinutes(wh, 'tue', DEFAULT_WORK_MINUTES)).toBe(540); // kalit yo'q → default
    expect(branchOpenMinutes(null, 'mon', DEFAULT_WORK_MINUTES)).toBe(540); // workHours yo'q → default
  });
});

describe('ds12-a comparison helpers', () => {
  test('deltaPct: baseline>0 → foiz', () => {
    expect(deltaPct(130, 100)).toBeCloseTo(30, 5);
    expect(deltaPct(80, 100)).toBeCloseTo(-20, 5);
  });
  test('deltaPct: baseline<=0 → null', () => {
    expect(deltaPct(50, 0)).toBeNull();
    expect(deltaPct(50, -5)).toBeNull();
  });
  test("comparisonEntry: baseline yo'q → null; bor → {total, deltaPct}", () => {
    expect(comparisonEntry(130, 0)).toBeNull();
    expect(comparisonEntry(130, 100)).toEqual({ total: 100, deltaPct: 30 });
  });
  test('periodLengthDays: inclusive', () => {
    expect(periodLengthDays('2026-06-01', '2026-06-30')).toBe(30);
    expect(periodLengthDays('2026-06-01', '2026-06-01')).toBe(1);
  });
  test('shiftDays / shiftYears', () => {
    expect(shiftDays('2026-06-01', -1)).toBe('2026-05-31');
    expect(shiftYears('2026-06-01', -1)).toBe('2025-06-01');
  });
});

describe('CLI-450: materialCostByService', () => {
  it('BOM + avg-cost — xizmat uchun material narxini SUM(qty × avgCost) hisoblaydi', () => {
    const bom = [
      { serviceId: 's1', itemId: 'i1', qtyPerService: 2 },
      { serviceId: 's1', itemId: 'i2', qtyPerService: 1 },
      { serviceId: 's2', itemId: 'i1', qtyPerService: 3 },
    ];
    const avgCostByItemId = new Map([
      ['i1', 1000],
      ['i2', 500],
    ]);
    const result = materialCostByService(bom, avgCostByItemId);
    expect(result.get('s1')).toBe(2500); // 2×1000 + 1×500
    expect(result.get('s2')).toBe(3000); // 3×1000
  });

  it("item uchun cost yozilmagan (avgCostByItemId'da yo'q) — narxi 0 (v1 approksimatsiya)", () => {
    const bom = [{ serviceId: 's1', itemId: 'i-no-cost', qtyPerService: 5 }];
    const result = materialCostByService(bom, new Map());
    expect(result.get('s1')).toBe(0);
  });

  it("bo'sh BOM — bo'sh Map", () => {
    expect(materialCostByService([], new Map()).size).toBe(0);
  });
});

describe('CLI-450: computeServiceMargin', () => {
  it('materialCost = materialCostPerOccurrence × count; margin = revenue - materialCost', () => {
    const row = computeServiceMargin('Plomba', 10, 500000, 20000);
    expect(row).toEqual({
      serviceName: 'Plomba',
      count: 10,
      revenue: 500000,
      materialCost: 200000, // 20000 × 10
      margin: 300000,
      marginPct: 0.6,
    });
  });

  it("revenue=0 → marginPct null (ma'noli foiz yo'q)", () => {
    const row = computeServiceMargin('X', 0, 0, 0);
    expect(row.marginPct).toBeNull();
    expect(row.margin).toBe(0);
  });

  it('materialCost > revenue — manfiy margin (zarar)', () => {
    const row = computeServiceMargin('Y', 5, 10000, 5000); // materialCost = 5×5000 = 25000
    expect(row.margin).toBe(-15000);
    expect(row.marginPct).toBe(-1.5);
  });
});
