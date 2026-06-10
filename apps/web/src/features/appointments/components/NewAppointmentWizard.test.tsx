import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { NewAppointmentWizard } from './NewAppointmentWizard';

vi.mock('../appointments.api', () => ({
  useCreateAppointment: () => ({ mutate: vi.fn(), isPending: false }),
  useDoctors: () => ({ data: [{ id: 'd1', name: 'Dr. Ali' }] }),
  useServices: () => ({ data: [] }),
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
vi.mock('@/stores/auth-store.ts', () => ({ useAuthStore: () => ({ activeBranchId: 'b1' }) }));

describe('NewAppointmentWizard', () => {
  it("birinchi qadam (Bemor) ko'rsatadi", () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    expect(screen.getByText('Bemor')).toBeInTheDocument();
  });
});
