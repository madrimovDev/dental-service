import type { Patient } from '@dental/api-client';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import type { PatientDetail } from '../../patients.types';
import { GeneralTab } from './GeneralTab';

const rawPatient: Patient = {
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
  tags: [],
  source: null,
  insurance: null,
  insuranceStatus: 'none',
  archivedAt: null,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const updateMutate = vi.fn();
vi.mock('../../patients.api', () => ({
  usePatientRaw: () => ({ data: rawPatient }),
  useUpdatePatient: () => ({ mutate: updateMutate, isPending: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('GeneralTab — edit forma telefon validatsiyasi (L13 regression guard)', () => {
  beforeEach(() => {
    updateMutate.mockClear();
  });

  it("noto'g'ri telefon kiritilib saqlansa xato ko'rinadi va submit bloklanadi", () => {
    renderApp(<GeneralTab patient={{ id: 'p1' } as PatientDetail} />);
    // PhoneInput faqat raqamlarni qabul qiladi — 2 ta raqam (5 xonali +998 bilan) regex'ni buzadi.
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: '12' } });
    fireEvent.click(screen.getByText('Saqlash'));
    const phoneInput = screen.getByLabelText('Telefon') as HTMLInputElement;
    expect(phoneInput).toHaveAttribute('aria-invalid', 'true');
    expect(updateMutate).not.toHaveBeenCalled();
  });
});
