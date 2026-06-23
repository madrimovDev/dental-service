import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PayrollScreen } from './PayrollScreen';

const draftRun = {
  id: 'run-1',
  periodFrom: '2026-06-01',
  periodTo: '2026-06-30',
  status: 'draft' as const,
  createdAt: '2026-06-01T00:00:00Z',
};

let canManage = true;

vi.mock('../payroll.api', () => ({
  usePayrollRuns: () => ({ data: [draftRun], isLoading: false, isError: false }),
  usePayrollRun: () => ({
    data: { ...draftRun, lines: [] },
    isLoading: false,
    isError: false,
  }),
  useCreateRun: () => ({ mutate: vi.fn(), isPending: false }),
  useFinalizeRun: () => ({ mutate: vi.fn(), isPending: false }),
  useUserAssignments: () => ({ data: [] }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (p: string) => (p === 'payroll.manage' ? canManage : true),
  }),
}));

describe('PayrollScreen (re-skin smoke)', () => {
  it('renders PageHead title + status pill label', () => {
    canManage = true;
    renderApp(<PayrollScreen />);

    // PageHead renders the title as an <h1>
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Ish haqi');

    // StatusPill uses the same status_label.draft key
    expect(screen.getByText('Qoralama')).toBeInTheDocument();
  });

  it('shows finalize button (gated by payroll.manage) when a draft run is selected', () => {
    canManage = true;
    renderApp(<PayrollScreen />);

    fireEvent.click(screen.getByText('Batafsil'));
    expect(screen.getByText('Yakunlash')).toBeInTheDocument();
  });

  it('hides finalize button when payroll.manage is missing', () => {
    canManage = false;
    renderApp(<PayrollScreen />);

    fireEvent.click(screen.getByText('Batafsil'));
    expect(screen.queryByText('Yakunlash')).not.toBeInTheDocument();
  });
});
