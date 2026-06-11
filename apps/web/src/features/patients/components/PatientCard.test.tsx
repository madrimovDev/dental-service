import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PatientCard } from './PatientCard';

vi.mock('../patients.api', () => ({
  usePatient: () => ({
    data: {
      id: 'p1',
      fullName: 'Ali Valiyev',
      phone: '+998901234567',
      phoneSecondary: null,
      dateOfBirthFormatted: null,
      age: null,
      genderLabel: '',
      passport: null,
      address: null,
      notes: null,
      tags: [],
      source: null,
      insurance: null,
      archived: false,
    },
  }),
  useMedicalRecord: () => ({ data: null }),
  usePatientBalance: () => ({ data: { balance: 0, planDebt: 0, nonPlanBalance: 0 } }),
  useUpdateMedicalRecord: () => ({ mutate: vi.fn() }),
  usePatientRaw: () => ({ data: null }),
  useUpdatePatient: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('PatientCard', () => {
  it("bemor ismi + tablarni ko'rsatadi", () => {
    renderApp(
      <Routes>
        <Route path="/patients/:id" element={<PatientCard />} />
      </Routes>,
      { route: '/patients/p1' },
    );
    expect(screen.getByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText('Umumiy')).toBeInTheDocument();
  });
});
