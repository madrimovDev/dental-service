import { describe, expect, it, test } from 'bun:test';
import {
  branchOpenMinutes,
  comparisonEntry,
  completionRate,
  DEFAULT_WORK_MINUTES,
  deltaPct,
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
