import { describe, expect, test } from 'bun:test';
import { createRunSchema } from './payroll.schema.ts';

/**
 * CLI-417 T2 — `periodFrom <= periodTo` Zod refine (pure unit test, DB'siz).
 */
describe('createRunSchema — periodFrom <= periodTo (CLI-417)', () => {
  test('teskari oraliq (periodFrom > periodTo) — rad etiladi', () => {
    const result = createRunSchema.safeParse({
      periodFrom: '2026-06-30',
      periodTo: '2026-06-01',
    });
    expect(result.success).toBe(false);
  });

  test('periodFrom == periodTo (bir kunlik davr) — ruxsat', () => {
    const result = createRunSchema.safeParse({
      periodFrom: '2026-06-01',
      periodTo: '2026-06-01',
    });
    expect(result.success).toBe(true);
  });

  test("to'g'ri oraliq (periodFrom < periodTo) — ruxsat", () => {
    const result = createRunSchema.safeParse({
      periodFrom: '2026-06-01',
      periodTo: '2026-06-30',
    });
    expect(result.success).toBe(true);
  });
});
