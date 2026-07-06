import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { TreatmentPlansScreen } from './TreatmentPlansScreen';

type Plan = {
  id: string;
  patientId: string;
  title: string;
  status: string;
  totalCost: string;
  totalVisits: number;
  updatedAt: string;
};

let plans: Plan[] = [];
let nameMap = new Map<string, string>();
let isLoading = false;
let isError = false;

vi.mock('../../clinical.api', () => ({
  useTreatmentPlansList: () => ({
    data: { data: plans, meta: { page: 1, pageSize: 20, total: plans.length } },
    isLoading,
    isError,
    refetch: vi.fn(),
  }),
  usePatientNames: () => nameMap,
}));

let perms = new Set<string>(['medical_record.view', 'patient.view']);
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: (p: string) => perms.has(p) }),
}));

function plan(over: Partial<Plan> = {}): Plan {
  return {
    id: 'pl1',
    patientId: 'pat-9',
    title: 'Implant',
    status: 'accepted',
    totalCost: '2500000',
    totalVisits: 4,
    updatedAt: '2026-06-20T05:00:00Z',
    ...over,
  };
}

describe('TreatmentPlansScreen (DS7)', () => {
  beforeEach(() => {
    plans = [];
    nameMap = new Map();
    isLoading = false;
    isError = false;
    perms = new Set(['medical_record.view', 'patient.view']);
  });

  it("bo'sh ro'yxatda empty holatni ko'rsatadi", () => {
    renderApp(<TreatmentPlansScreen />);
    expect(screen.getByText('Davolash rejalari topilmadi')).toBeInTheDocument();
  });

  it("bemor ismi hal qilinganda link sifatida ko'rsatadi", () => {
    plans = [plan()];
    nameMap = new Map([['pat-9', 'Ali Valiyev']]);
    renderApp(<TreatmentPlansScreen />);
    const link = screen.getByRole('link', { name: 'Ali Valiyev' });
    expect(link).toHaveAttribute('href', '/patients/pat-9');
  });

  it("patient.view yo'q (ism hal qilinmaydi) → qisqartirilgan id fallback, link emas", () => {
    perms = new Set(['medical_record.view']); // patient.view YO'Q
    plans = [plan({ patientId: 'abcdef12-3456' })];
    nameMap = new Map(); // usePatientNames enabled=false → bo'sh
    renderApp(<TreatmentPlansScreen />);
    expect(screen.getByText('abcdef12')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /abcdef/ })).not.toBeInTheDocument();
  });

  it('xato holatida error StateView + retry', () => {
    isError = true;
    renderApp(<TreatmentPlansScreen />);
    expect(screen.getByText('Qayta urinish')).toBeInTheDocument();
  });
});
