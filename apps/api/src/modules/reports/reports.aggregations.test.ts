import { describe, expect, it } from 'bun:test';
import {
  branchOpenMinutes,
  completionRate,
  DEFAULT_WORK_MINUTES,
  noShowRate,
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
  it('branchOpenMinutes', () => {
    const wh = { mon: { open: '09:00', close: '18:00' }, sun: null };
    expect(branchOpenMinutes(wh, 'mon', DEFAULT_WORK_MINUTES)).toBe(540);
    expect(branchOpenMinutes(wh, 'sun', DEFAULT_WORK_MINUTES)).toBe(0); // yopiq
    expect(branchOpenMinutes(wh, 'tue', DEFAULT_WORK_MINUTES)).toBe(540); // kalit yo'q → default
    expect(branchOpenMinutes(null, 'mon', DEFAULT_WORK_MINUTES)).toBe(540); // workHours yo'q → default
  });
});
