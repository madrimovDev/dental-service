import { describe, expect, it } from 'bun:test';
import { uploadImageMetadataSchema } from './patient-images.schema.ts';

/**
 * CLI-422 — uploadImageMetadataSchema safeParse (SOF, DB'siz ishga tushiriladi).
 * Route'da storage yozishdan OLDIN chaqiriladi — bad input hech qanday object
 * yozmasligini kafolatlaydi (routes darajasida tekshiriladi, bu yerda faqat schema
 * xulqi: qabul/rad + toothNumbers FDI filtr).
 */
describe('CLI-422 — uploadImageMetadataSchema', () => {
  const validBase = {
    patientId: '11111111-1111-4111-8111-111111111111',
    type: 'xray_panoramic' as const,
  };

  it('accepts valid minimal input', () => {
    const result = uploadImageMetadataSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID patientId', () => {
    const result = uploadImageMetadataSchema.safeParse({ ...validBase, patientId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID visitNoteId', () => {
    const result = uploadImageMetadataSchema.safeParse({
      ...validBase,
      visitNoteId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid takenDate (not ISO datetime)', () => {
    const result = uploadImageMetadataSchema.safeParse({
      ...validBase,
      takenDate: 'Invalid Date',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid ISO takenDate', () => {
    const result = uploadImageMetadataSchema.safeParse({
      ...validBase,
      takenDate: '2026-07-06T10:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects title over 200 chars', () => {
    const result = uploadImageMetadataSchema.safeParse({
      ...validBase,
      title: 'x'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('toothNumbers string form: filters NaN/non-positive, keeps valid FDI', () => {
    const result = uploadImageMetadataSchema.safeParse({
      ...validBase,
      toothNumbers: '11,foo,21,-5,0,3.5',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // 3.5 → Number('3.5')=3.5 not integer → filtered; -5,0 not positive → filtered.
      expect(result.data.toothNumbers).toEqual([11, 21]);
    }
  });

  it('toothNumbers array form: filters non-integer/non-positive', () => {
    const result = uploadImageMetadataSchema.safeParse({
      ...validBase,
      toothNumbers: [11, -1, 0, 21],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.toothNumbers).toEqual([11, 21]);
    }
  });

  it('rejects invalid type enum', () => {
    const result = uploadImageMetadataSchema.safeParse({ ...validBase, type: 'not_a_type' });
    expect(result.success).toBe(false);
  });
});
