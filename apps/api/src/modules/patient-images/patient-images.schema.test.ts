import { describe, expect, it } from 'bun:test';
import { updateImageMetadataSchema, uploadImageMetadataSchema } from './patient-images.schema.ts';

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

  // FT-01.4: FDI validatori — yaroqsiz raqam endi jim tashlanmaydi, 400 (rasm noto'g'ri tishga
  // bog'lanib qolmasin). Bo'sh segmentlar (oxirgi vergul, bo'sh joy) e'tiborsiz.
  it('toothNumbers string form: valid FDI list (bo‘sh segmentlar e‘tiborsiz)', () => {
    const result = uploadImageMetadataSchema.safeParse({
      ...validBase,
      toothNumbers: ' 11, 21 ,, 85,',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.toothNumbers).toEqual([11, 21, 85]);
  });

  it('toothNumbers string form: NaN / FDI emas → rad', () => {
    for (const bad of ['11,foo', '11,19', '3.5', '-5', '0', '99']) {
      const result = uploadImageMetadataSchema.safeParse({ ...validBase, toothNumbers: bad });
      expect(result.success).toBe(false);
    }
  });

  it('toothNumbers array form: FDI emas → rad, FDI → qabul', () => {
    expect(
      uploadImageMetadataSchema.safeParse({ ...validBase, toothNumbers: [11, 29] }).success,
    ).toBe(false);
    const ok = uploadImageMetadataSchema.safeParse({ ...validBase, toothNumbers: [11, 21] });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.toothNumbers).toEqual([11, 21]);
  });

  it('updateImageMetadataSchema: FDI emas → rad, null → qabul', () => {
    expect(updateImageMetadataSchema.safeParse({ toothNumbers: [56] }).success).toBe(false);
    expect(updateImageMetadataSchema.safeParse({ toothNumbers: [55] }).success).toBe(true);
    expect(updateImageMetadataSchema.safeParse({ toothNumbers: null }).success).toBe(true);
  });

  it('rejects invalid type enum', () => {
    const result = uploadImageMetadataSchema.safeParse({ ...validBase, type: 'not_a_type' });
    expect(result.success).toBe(false);
  });
});
