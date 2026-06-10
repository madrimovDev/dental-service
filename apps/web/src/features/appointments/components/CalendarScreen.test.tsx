import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { CalendarScreen } from './CalendarScreen';

vi.mock('../appointments.api', () => ({
  useAppointments: () => ({ data: [], isLoading: false }),
  useDoctors: () => ({ data: [{ id: 'd1', name: 'Dr. Ali' }] }),
  useCancelAppointment: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true, activeBranchId: 'b1' }),
}));
vi.mock('@/lib/api.ts', () => ({
  api: {
    patients: { list: vi.fn(() => Promise.resolve({ data: [], meta: {} })) },
    branches: { list: vi.fn(() => Promise.resolve([])) },
  },
}));

describe('CalendarScreen', () => {
  it("sarlavha va kun/hafta toggle ko'rsatadi", () => {
    renderApp(<CalendarScreen />);
    expect(screen.getByText('Kun')).toBeInTheDocument();
    expect(screen.getByText('Hafta')).toBeInTheDocument();
  });
});
