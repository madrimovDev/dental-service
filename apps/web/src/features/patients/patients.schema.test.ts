import { describe, expect, it } from 'vitest';
import { patientFormSchema } from './patients.schema';

const base = { fullName: 'Ali Valiyev', tags: [] };

describe("patientFormSchema — sug'urta refine (CLI-469)", () => {
  it('insurance null bo‘lsa valid', () => {
    const r = patientFormSchema.safeParse({ ...base, insurance: null });
    expect(r.success).toBe(true);
  });

  it('provider + policyNumber ikkalasi to‘ldirilsa valid', () => {
    const r = patientFormSchema.safeParse({
      ...base,
      insurance: { provider: 'Gross', policyNumber: 'X1' },
    });
    expect(r.success).toBe(true);
  });

  it('faqat coverageType to‘ldirilib provider bo‘sh qolsa invalid (provider majburiy)', () => {
    const r = patientFormSchema.safeParse({
      ...base,
      insurance: { provider: '', policyNumber: '', coverageType: 'dental' },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'insurance.provider')).toBe(true);
    }
  });

  it('faqat expiryDate to‘ldirilib provider bo‘sh qolsa invalid', () => {
    const r = patientFormSchema.safeParse({
      ...base,
      insurance: { provider: '', policyNumber: '', expiryDate: '2030-01-01' },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'insurance.provider')).toBe(true);
    }
  });

  it('faqat isActive:true bo‘lib provider bo‘sh qolsa invalid', () => {
    const r = patientFormSchema.safeParse({
      ...base,
      insurance: { provider: '', policyNumber: '', isActive: true },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'insurance.provider')).toBe(true);
    }
  });

  it('provider to‘ldirilib policyNumber bo‘sh qolsa hamon invalid (mavjud xulq saqlanadi)', () => {
    const r = patientFormSchema.safeParse({
      ...base,
      insurance: { provider: 'Gross', policyNumber: '' },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'insurance.policyNumber')).toBe(true);
    }
  });
});
