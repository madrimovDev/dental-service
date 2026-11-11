import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { BranchesSettingsScreen } from './BranchesSettingsScreen';

const mutateMock = vi.hoisted(() => vi.fn());
vi.mock('../settings.api', () => ({
  useBranches: () => ({
    isLoading: false,
    data: [
      { id: 'b1', name: 'Asosiy filial', address: 'Toshkent', phone: '+998901112233' },
      { id: 'b2', name: 'Chilonzor', address: null, phone: null },
    ],
  }),
  useUsers: () => ({
    data: [
      { assignmentId: 'a1', branchId: 'b1', isActive: true },
      { assignmentId: 'a2', branchId: 'b1', isActive: true },
    ],
  }),
  useUpsertBranch: () => ({ mutate: mutateMock, isPending: false }),
  useDeleteBranch: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('BranchesSettingsScreen', () => {
  it('CSS-grid jadval filiallarni va xodim sonini ko’rsatadi', () => {
    renderApp(<BranchesSettingsScreen />);

    // Card header + create button
    expect(screen.getByRole('button', { name: 'Yangi filial' })).toBeInTheDocument();

    // Rows
    expect(screen.getByText('Asosiy filial')).toBeInTheDocument();
    expect(screen.getByText('Chilonzor')).toBeInTheDocument();

    // Phone (mono) + em-dash fallback
    expect(screen.getByText('+998901112233')).toBeInTheDocument();

    // Staff count column (client-side CLI-159): b1 has 2 active staff
    expect(screen.getByText('2 xodim')).toBeInTheDocument();
    expect(screen.getByText('0 xodim')).toBeInTheDocument();

    // Status pill: active when count>0, inactive otherwise
    expect(screen.getByText('Faol')).toBeInTheDocument();
    expect(screen.getByText('Faol emas')).toBeInTheDocument();

    // Edit/delete actions present
    expect(screen.getAllByLabelText('Tahrirlash').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("O'chirish").length).toBeGreaterThan(0);
  });

  it('yangi filial formasida ish soati muharriri default bilan, saqlashda workHours yuboriladi (P10)', async () => {
    mutateMock.mockReset();
    renderApp(<BranchesSettingsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Yangi filial' }));
    expect(await screen.findByLabelText('Dushanba — Ochilish')).toHaveValue('09:00');
    fireEvent.change(screen.getByLabelText('Filial nomi', { exact: false }), {
      target: { value: 'Yangi' },
    });
    fireEvent.click(screen.getByLabelText('Shanba — Ochiq'));
    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalled());
    const body = mutateMock.mock.calls[0]?.[0];
    expect(body?.workHours.sat).toBeNull();
    expect(body?.workHours.mon).toEqual({ open: '09:00', close: '18:00' });
  });
});
