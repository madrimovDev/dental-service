import { describe, expect, it } from 'bun:test';
import type { toothStates } from '@dental/db-schema';
import { dedupeByToothSurface } from './tooth-charts.dedup.ts';

type StateInsert = typeof toothStates.$inferInsert;

/**
 * CLI-439 B6 — odontogram bir tishda bir nechta surface-state'ni collapse qilishning
 * app-level fix'i: dedupeByToothSurface (SOF, DB'siz). Bir xil (toothNumber, surface)
 * kombinatsiyasi bir necha marta bo'lsa — OXIRGISI saqlanadi, dublikat qator yaratilmaydi.
 */
describe('CLI-439 B6 — dedupeByToothSurface', () => {
  it('keeps distinct (tooth, surface) rows untouched', () => {
    const states: StateInsert[] = [
      { toothChartId: 'c1', toothNumber: 11, surface: 'M', state: 'caries' },
      { toothChartId: 'c1', toothNumber: 11, surface: 'D', state: 'filling' },
      { toothChartId: 'c1', toothNumber: 21, surface: 'whole', state: 'healthy' },
    ];
    const result = dedupeByToothSurface(states);
    expect(result.length).toBe(3);
  });

  it('collapses duplicate (tooth, surface) to the LAST occurrence', () => {
    const states: StateInsert[] = [
      { toothChartId: 'c1', toothNumber: 11, surface: 'M', state: 'caries' },
      { toothChartId: 'c1', toothNumber: 11, surface: 'M', state: 'filling' }, // later edit wins
    ];
    const result = dedupeByToothSurface(states);
    expect(result.length).toBe(1);
    expect(result[0]?.state).toBe('filling');
  });

  it('same tooth, different surfaces are NOT collapsed', () => {
    const states: StateInsert[] = [
      { toothChartId: 'c1', toothNumber: 11, surface: 'M', state: 'caries' },
      { toothChartId: 'c1', toothNumber: 11, surface: 'D', state: 'caries' },
      { toothChartId: 'c1', toothNumber: 11, surface: 'O', state: 'caries' },
    ];
    const result = dedupeByToothSurface(states);
    expect(result.length).toBe(3);
  });

  it('missing surface defaults to "whole" key for dedup purposes', () => {
    const states: StateInsert[] = [
      { toothChartId: 'c1', toothNumber: 11, state: 'healthy' },
      { toothChartId: 'c1', toothNumber: 11, surface: 'whole', state: 'caries' },
    ];
    const result = dedupeByToothSurface(states);
    expect(result.length).toBe(1);
    expect(result[0]?.state).toBe('caries');
  });

  it('empty input returns empty output', () => {
    expect(dedupeByToothSurface([])).toEqual([]);
  });
});
