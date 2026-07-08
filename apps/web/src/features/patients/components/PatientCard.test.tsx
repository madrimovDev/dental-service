import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PatientCard } from './PatientCard';

const { medicalHolder, permsHolder } = vi.hoisted(() => ({
  medicalHolder: { current: null as unknown },
  permsHolder: { current: [] as string[] },
}));

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
  useMedicalRecord: () => ({ data: medicalHolder.current }),
  usePatientBalance: () => ({ data: { balance: 0, planDebt: 0, nonPlanBalance: 0 } }),
  useUpdateMedicalRecord: () => ({ mutate: vi.fn() }),
  usePatientRaw: () => ({ data: null }),
  useUpdatePatient: () => ({ mutate: vi.fn(), isPending: false }),
}));

// CLI-456: 'pay' tab endi `cashier.view` bilan gate qilinadi — real Zustand store
// (default permissions: []) o'rniga mock, per-test toggle qilinadigan ro'yxat bilan.
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (code: string) => permsHolder.current.includes(code),
  }),
}));

describe('PatientCard', () => {
  beforeEach(() => {
    permsHolder.current = [];
  });

  it("bemor ismi + tablarni ko'rsatadi", () => {
    medicalHolder.current = null;
    renderApp(
      <Routes>
        <Route path="/patients/:id" element={<PatientCard />} />
      </Routes>,
      { route: '/patients/p1' },
    );
    expect(screen.getByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText('Umumiy')).toBeInTheDocument();
  });

  it("severe anestetik allergiya bo'lganda allergiya barini ko'rsatadi", () => {
    medicalHolder.current = {
      allergies: [{ type: 'anesthetic', substance: 'Lidokain', severity: 'severe' }],
    };
    renderApp(
      <Routes>
        <Route path="/patients/:id" element={<PatientCard />} />
      </Routes>,
      { route: '/patients/p1' },
    );
    // Data-driven (i18n'dan mustaqil) — allergiya bari render bo'lganini tasdiqlaydi.
    expect(screen.getByText('Lidokain')).toBeInTheDocument();
  });

  it("cashier.view ruxsati bo'lmasa 'To'lovlar' tab ko'rinmaydi (CLI-456)", () => {
    permsHolder.current = [];
    renderApp(
      <Routes>
        <Route path="/patients/:id" element={<PatientCard />} />
      </Routes>,
      { route: '/patients/p1' },
    );
    expect(screen.queryByText("To'lovlar")).not.toBeInTheDocument();
  });

  it("cashier.view ruxsati bilan 'To'lovlar' tab ko'rinadi (CLI-456)", () => {
    permsHolder.current = ['cashier.view'];
    renderApp(
      <Routes>
        <Route path="/patients/:id" element={<PatientCard />} />
      </Routes>,
      { route: '/patients/p1' },
    );
    expect(screen.getByText("To'lovlar")).toBeInTheDocument();
  });
});
