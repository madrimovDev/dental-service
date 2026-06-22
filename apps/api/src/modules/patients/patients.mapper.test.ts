/**
 * V3-5 (Insurance) — insuranceStatus compute (sof, DB'siz).
 * Ishga tushirish: `cd apps/api && bun test patients.mapper`
 */
import { describe, expect, test } from 'bun:test';
import type { Patient } from '@dental/db-schema';
import { toPatientDto } from './patients.mapper.ts';

const base = {
  id: 'p1',
  tenantId: 't1',
  fullName: 'Bemor',
  dateOfBirth: null,
  gender: null,
  phone: null,
  phoneSecondary: null,
  passport: null,
  address: null,
  photoUrl: null,
  notes: null,
  tags: [],
  source: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
} as unknown as Patient;

describe('insuranceStatus compute', () => {
  test('insurance yo‘q → none', () => {
    expect(toPatientDto({ ...base, insurance: null }).insuranceStatus).toBe('none');
  });
  test('isActive=false → inactive', () => {
    expect(
      toPatientDto({
        ...base,
        insurance: { provider: 'X', policyNumber: '1', isActive: false },
      }).insuranceStatus,
    ).toBe('inactive');
  });
  test('expiryDate o‘tgan → expired', () => {
    expect(
      toPatientDto({
        ...base,
        insurance: { provider: 'X', policyNumber: '1', expiryDate: '2000-01-01' },
      }).insuranceStatus,
    ).toBe('expired');
  });
  test('kelajakdagi expiry + faol → active', () => {
    expect(
      toPatientDto({
        ...base,
        insurance: { provider: 'X', policyNumber: '1', expiryDate: '2099-01-01', isActive: true },
      }).insuranceStatus,
    ).toBe('active');
  });
});
