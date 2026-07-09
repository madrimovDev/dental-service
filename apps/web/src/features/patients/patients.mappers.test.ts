import type { Patient } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import { calcAge, formatDate, toPatientDetail, toPatientListItem } from './patients.mappers';

const base: Patient = {
  id: 'p1',
  tenantId: 't1',
  fullName: 'Ali Valiyev',
  dateOfBirth: '1990-06-08',
  gender: 'male',
  phone: '+998901234567',
  phoneSecondary: null,
  passport: null,
  address: null,
  photoUrl: null,
  notes: null,
  tags: ['VIP'],
  source: 'Tavsiya',
  insurance: null,
  insuranceStatus: 'none',
  allowEmergencyRecall: false,
  archivedAt: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('patients.mappers', () => {
  it('calcAge sanadan yoshni hisoblaydi', () => {
    expect(calcAge('1990-06-08', new Date('2026-06-10'))).toBe(36);
    expect(calcAge(null)).toBeNull();
  });
  it('formatDate DD.MM.YYYY', () => {
    expect(formatDate('1990-06-08')).toBe('08.06.1990');
    expect(formatDate(null)).toBeNull();
  });
  it('toPatientListItem gender label + tags + balance', () => {
    const vm = toPatientListItem(
      { ...base, balance: 150000, noShowStrikes: 0, flagged: false },
      (k) => k,
    );
    expect(vm.genderLabel).toBe('patients.gender.male');
    expect(vm.tags).toEqual(['VIP']);
    expect(vm.age).toBeGreaterThan(0);
    expect(vm.balance).toBe(150000);
  });
  it("toPatientDetail sana formatlaydi va insurance o'tkazadi", () => {
    const vm = toPatientDetail(
      {
        ...base,
        insurance: {
          provider: 'Gross',
          policyNumber: 'X1',
          coverageType: 'dental',
          expiryDate: null,
          isActive: true,
        },
        insuranceStatus: 'active',
      },
      (k) => k,
    );
    expect(vm.dateOfBirthFormatted).toBe('08.06.1990');
    expect(vm.insurance?.provider).toBe('Gross');
    expect(vm.insuranceStatus).toBe('active');
  });
});
