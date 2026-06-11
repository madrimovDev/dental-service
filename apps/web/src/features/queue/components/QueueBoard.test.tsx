import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { QueueBoard } from './QueueBoard';

vi.mock('../queue.api', () => ({
  useBranches: () => ({ data: [{ id: 'b1', name: 'Asosiy' }] }),
  usePatientsAll: () => ({ data: { data: [] } }),
  useServices: () => ({ data: [] }),
  useQueueToday: () => ({ data: [] }),
  useCheckInCandidates: () => ({ data: [] }),
  useCreateTicket: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateQueueStatus: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true, activeBranchId: 'b1' }),
}));

describe('QueueBoard', () => {
  it("3 ustun sarlavhasini ko'rsatadi", () => {
    renderApp(<QueueBoard />);
    expect(screen.getByText(/Kutmoqda/)).toBeInTheDocument();
    expect(screen.getByText(/Davom etmoqda/)).toBeInTheDocument();
    expect(screen.getByText(/Bajarilgan/)).toBeInTheDocument();
  });
});
