import { ApiError } from '@dental/api-client';
import { ROLE_TEMPLATES } from '@dental/core';
import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PatientCard } from './PatientCard';

const h = vi.hoisted(() => ({
  perms: [] as string[],
  medical: null as unknown,
  plans: { data: [] as unknown, error: null as unknown },
  confirm: vi.fn(),
}));

const permsFor = (key: string): string[] => {
  const tpl = ROLE_TEMPLATES.find((r) => r.templateKey === key);
  if (!tpl) throw new Error(key);
  return [...tpl.permissions];
};

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
  useMedicalRecord: () => ({ data: h.medical }),
  usePatientBalance: () => ({ data: { balance: 250000, planDebt: 250000, nonPlanBalance: 0 } }),
  useConfirmMedicalRecord: () => ({ mutate: h.confirm, isPending: false }),
  useUpdateMedicalRecord: () => ({ mutate: vi.fn() }),
  usePatientRaw: () => ({ data: null }),
  useUpdatePatient: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/clinical/clinical.api', () => ({
  useTreatmentPlans: () => ({
    data: h.plans.data,
    error: h.plans.error,
    isLoading: false,
    isError: !!h.plans.error,
  }),
  useVisitNotes: () => ({ data: [], isLoading: false, isError: false }),
  useDiagnoses: () => ({ data: [] }),
  useLatestToothChart: () => ({ data: undefined, isLoading: false, isError: false }),
  usePatientAppointments: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: (code: string) => h.perms.includes(code) }),
}));

const mount = () =>
  renderApp(
    <Routes>
      <Route path="/patients/:id" element={<PatientCard />} />
    </Routes>,
    { route: '/patients/p1' },
  );

describe('PatientCard — 4 bo’lim, rol bo’yicha (real rol shablonlari)', () => {
  beforeEach(() => {
    h.medical = {
      confirmedAt: null,
      allergies: [{ type: 'medication', substance: 'Penitsillin', severity: 'severe' }],
    };
    h.plans = { data: [], error: null };
    h.confirm.mockReset();
  });

  it('Doctor: Umumiy, Davolash va Hujjatlar bo’limlarini ko’radi', () => {
    h.perms = permsFor('doctor');
    mount();
    expect(screen.getByRole('tab', { name: 'Umumiy' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Davolash' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Hujjatlar va rasmlar/ })).toBeInTheDocument();
  });

  it('allergiya banneri sarlavhada doimiy turadi (barcha bo’limlarda)', () => {
    h.perms = permsFor('doctor');
    mount();
    const banner = screen.getAllByRole('alert')[0] as HTMLElement;
    expect(banner).toHaveTextContent('Penitsillin');
    fireEvent.click(screen.getByRole('tab', { name: 'Davolash' }));
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Penitsillin');
  });

  it('Receptionist: «Davolash» bo’limi YO’Q, klinik bloklar o’rnida forbidden holati (bo’sh emas)', () => {
    h.perms = permsFor('receptionist');
    h.medical = undefined; // medical_record.view yo'q — so'rov yuborilmaydi
    mount();
    expect(screen.queryByRole('tab', { name: 'Davolash' })).not.toBeInTheDocument();
    expect(screen.queryByText('Anamnez')).not.toBeInTheDocument();
    expect(screen.queryByText('Faol reja')).not.toBeInTheDocument();
    expect(document.querySelector('[data-state="forbidden"]')).not.toBeNull();
    // Moliya (cashier.view) bor
    expect(screen.getByRole('tab', { name: /Moliya/ })).toBeInTheDocument();
  });

  it('Nurse: medical_record.view bor, edit yo’q — anamnez ko’rinadi, tasdiqlash tugmasi YO’Q', () => {
    h.perms = permsFor('nurse');
    mount();
    expect(screen.getByText('Anamnez')).toBeInTheDocument();
    expect(screen.queryByText(/o.zgarish yo.q — tasdiqlash/i)).not.toBeInTheDocument();
  });

  it('Doctor: «tasdiqlash» tugmasi mutatsiyani chaqiradi', () => {
    h.perms = permsFor('doctor');
    mount();
    fireEvent.click(screen.getByRole('button', { name: /tasdiqlash/i }));
    expect(h.confirm).toHaveBeenCalledTimes(1);
  });

  it('server 403 (rejalar) -> forbidden holati, «reja yo’q» emas', () => {
    h.perms = permsFor('doctor');
    h.plans = { data: undefined, error: new ApiError('forbidden', 'no', 403) };
    mount();
    expect(document.querySelector('[data-state="forbidden"]')).not.toBeNull();
    expect(screen.queryByText(/Faol davolash rejasi yo.q/)).not.toBeInTheDocument();
  });

  it('faol reja: progress + bugungi bosqich', () => {
    h.perms = permsFor('doctor');
    h.plans = {
      data: [
        {
          id: 'pl1',
          title: 'Protez (26)',
          status: 'in_progress',
          createdAt: '2026-10-01T00:00:00Z',
          stages: [
            {
              id: 's1',
              sequence: 1,
              status: 'completed',
              serviceName: 'Tayyorlash',
              cost: '100000',
              toothNumbers: [26],
            },
            {
              id: 's2',
              sequence: 2,
              status: 'pending',
              serviceName: 'Doimiy tojni o’rnatish',
              cost: '800000',
              toothNumbers: [26],
            },
          ],
        },
      ],
      error: null,
    };
    mount();
    expect(screen.getByText(/Protez \(26\)/)).toBeInTheDocument();
    expect(screen.getByText('Doimiy tojni o’rnatish')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /2 bosqichdan 1 tasi/ })).toBeInTheDocument();
  });
});
