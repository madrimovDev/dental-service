import { describe, expect, test } from 'bun:test';
import { createToothChartSchema, isValidFdi } from './tooth-charts.schema.ts';

const VALID_PERMANENT = [11, 18, 21, 28, 31, 38, 41, 48, 16];
const VALID_PRIMARY = [51, 55, 61, 65, 71, 75, 81, 85];
const INVALID = [10, 19, 29, 39, 49, 50, 56, 57, 60, 66, 70, 76, 80, 86, 9, 100];

describe('isValidFdi', () => {
  for (const n of [...VALID_PERMANENT, ...VALID_PRIMARY]) {
    test(`valid FDI ${n}`, () => expect(isValidFdi(n)).toBe(true));
  }
  for (const n of INVALID) {
    test(`invalid FDI ${n}`, () => expect(isValidFdi(n)).toBe(false));
  }
});

const baseChart = (toothNumber: number) => ({
  patientId: '8a760230-036d-4f26-b494-6906f1c240c7',
  states: [{ toothNumber, state: 'healthy' as const }],
});

describe('createToothChartSchema FDI validation', () => {
  test('valid FDI accepted (16)', () => {
    expect(createToothChartSchema.safeParse(baseChart(16)).success).toBe(true);
  });

  test('valid primary FDI accepted (55)', () => {
    expect(createToothChartSchema.safeParse(baseChart(55)).success).toBe(true);
  });

  test('invalid FDI 19 rejected', () => {
    expect(createToothChartSchema.safeParse(baseChart(19)).success).toBe(false);
  });

  test('invalid FDI 29 rejected', () => {
    expect(createToothChartSchema.safeParse(baseChart(29)).success).toBe(false);
  });

  test('invalid FDI 49 rejected', () => {
    expect(createToothChartSchema.safeParse(baseChart(49)).success).toBe(false);
  });

  test('invalid FDI 56 rejected', () => {
    expect(createToothChartSchema.safeParse(baseChart(56)).success).toBe(false);
  });

  test('coerces string FDI then validates', () => {
    const r = createToothChartSchema.safeParse({
      patientId: '8a760230-036d-4f26-b494-6906f1c240c7',
      states: [{ toothNumber: '16', state: 'healthy' }],
    });
    expect(r.success).toBe(true);
  });
});
