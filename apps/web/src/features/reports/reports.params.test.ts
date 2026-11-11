import { describe, expect, it } from 'vitest';
import { parseReportParams, toSearchParams } from './reports.params';
import { QUESTIONS, questionLock, resolveQuestion } from './reports.questions';

const NOW = new Date(2026, 10, 11); // 2026-11-11 (lokal)

describe('reports.params', () => {
  it('URL bo‘sh → oxirgi 30 kun, filial/savol yo‘q', () => {
    const p = parseReportParams(new URLSearchParams(), null, NOW);
    expect(p).toEqual({ from: '2026-10-13', to: '2026-11-11', branchId: null, q: null });
  });

  it('URL storage’dan ustun; noto‘g‘ri sana e’tiborsiz; teskari oraliq almashtiriladi', () => {
    const sp = new URLSearchParams('from=2026-09-30&to=2026-09-01&branch=b1&q=debt');
    const p = parseReportParams(sp, { branchId: 'x', q: 'today' }, NOW);
    expect(p).toMatchObject({ from: '2026-09-01', to: '2026-09-30', branchId: 'b1', q: 'debt' });
    expect(parseReportParams(new URLSearchParams('from=abc'), null, NOW).from).toBe('2026-10-13');
  });

  it('URL bo‘sh bo‘lsa storage ishlatiladi; roundtrip', () => {
    const stored = { from: '2026-01-01', to: '2026-01-31', branchId: 'b2', q: 'revenue' };
    const p = parseReportParams(new URLSearchParams(), stored, NOW);
    expect(p).toEqual(stored);
    expect(parseReportParams(toSearchParams(p), null, NOW)).toEqual(p);
  });
});

describe('reports.questions', () => {
  it('filialga tayinlangan xodimga tenant-darajali savollar yopiq, qolganlari ochiq', () => {
    const locked = QUESTIONS.filter((q) => questionLock(q, false) === 'clinicWide').map(
      (q) => q.key,
    );
    expect(locked).toEqual(['debt', 'services', 'pnl', 'newPatients', 'recall', 'plans']);
    expect(QUESTIONS.filter((q) => questionLock(q, true) === 'clinicWide')).toHaveLength(0);
  });

  it('yopiq/noma’lum `q` → birinchi ochiq savol', () => {
    expect(resolveQuestion('debt', false).key).toBe('today');
    expect(resolveQuestion('debt', true).key).toBe('debt');
    expect(resolveQuestion('stock', true).key).toBe('today');
    expect(resolveQuestion(null, true).key).toBe('today');
  });
});
