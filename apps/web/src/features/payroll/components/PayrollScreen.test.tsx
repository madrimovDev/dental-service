import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PayrollScreen } from './PayrollScreen';

const draftRun = {
  id: 'run-1',
  periodFrom: '2026-06-01',
  periodTo: '2026-06-30',
  status: 'draft' as const,
  createdAt: '2026-06-01T00:00:00Z',
};

const payrollLine = {
  id: 'line-1',
  tenantId: 't1',
  runId: 'run-1',
  userId: 'u1',
  baseSalary: '500000',
  attributedRevenue: '1000000',
  commissionPercent: '10',
  commissionAmount: '100000',
  total: '600000',
  createdAt: '2026-06-01T00:00:00Z',
};

let canManage = true;
// CLI-470: run detail lines + staff-names ro'yxati — testlar bo'yicha override qilinadi.
let runLines: (typeof payrollLine)[] = [];
let staffNames: { userId: string; fullName: string }[] = [];

vi.mock('../payroll.api', () => ({
  usePayrollRuns: () => ({ data: [draftRun], isLoading: false, isError: false }),
  usePayrollRun: () => ({
    data: { ...draftRun, lines: runLines },
    isLoading: false,
    isError: false,
  }),
  useCreateRun: () => ({ mutate: vi.fn(), isPending: false }),
  useFinalizeRun: () => ({ mutate: vi.fn(), isPending: false }),
  useStaffNames: () => ({ data: staffNames }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (p: string) => (p === 'payroll.manage' ? canManage : true),
  }),
}));

describe('PayrollScreen (re-skin smoke)', () => {
  beforeEach(() => {
    canManage = true;
    runLines = [];
    staffNames = [];
  });

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

  // CLI-470: Accountant rolida `user.view` yo'q — xodim ismi endi `useStaffNames()`
  // (`payroll.view`-gated) orqali yechiladi, `useUserAssignments()` (`user.view`) EMAS.
  it('xodim nomini useStaffNames() orqali yechadi (CLI-470)', () => {
    runLines = [payrollLine];
    staffNames = [{ userId: 'u1', fullName: 'Aliyev Shifokor' }];
    renderApp(<PayrollScreen />);

    fireEvent.click(screen.getByText('Batafsil'));
    expect(screen.getByText('Aliyev Shifokor')).toBeInTheDocument();
  });
});
