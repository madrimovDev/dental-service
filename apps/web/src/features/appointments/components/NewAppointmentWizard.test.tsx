import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { NewAppointmentWizard } from './NewAppointmentWizard';

vi.mock('../appointments.api', () => ({
  useCreateAppointment: () => ({ mutate: vi.fn(), isPending: false }),
  useDoctors: () => ({ data: [{ id: 'd1', name: 'Dr. Ali' }] }),
  useServices: () => ({ data: [] }),
  useBranches: () => ({ data: [{ id: 'b1', name: 'Markaziy filial' }] }),
}));
vi.mock('@/features/patients', () => ({
  usePatients: () => ({ data: { items: [], meta: {} } }),
}));
vi.mock('@/lib/api.ts', () => ({
  api: {
    patients: { list: vi.fn(() => Promise.resolve({ data: [], meta: {} })) },
    services: { list: vi.fn(() => Promise.resolve([])) },
    branches: { list: vi.fn(() => Promise.resolve([])) },
  },
}));

const mockAuth = vi.hoisted(() => ({ activeBranchId: 'b1' as string | null }));
vi.mock('@/stores/auth-store.ts', () => ({ useAuthStore: () => mockAuth }));

describe('NewAppointmentWizard', () => {
  afterEach(() => {
    mockAuth.activeBranchId = 'b1';
  });

  it("birinchi qadam (Bemor) ko'rsatadi", () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    expect(screen.getByText('Bemor')).toBeInTheDocument();
  });

  it("branch-bound foydalanuvchida filial Select ko'rsatilmaydi", () => {
    mockAuth.activeBranchId = 'b1';
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    expect(screen.queryByText('Filial')).not.toBeInTheDocument();
  });

  it("tenant-wide foydalanuvchida (activeBranchId=null) filial Select ko'rsatiladi (CLI-151)", () => {
    mockAuth.activeBranchId = null;
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    expect(screen.getByText('Filial')).toBeInTheDocument();
  });
});
