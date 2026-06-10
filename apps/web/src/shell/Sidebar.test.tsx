import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { Sidebar } from './Sidebar';

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (p: string) => p === 'patient.view',
    activeBranchId: 'b1',
  }),
}));

describe('Sidebar', () => {
  it("ruxsatli LIVE element ko'rsatadi, ruxsatsizni yashiradi", () => {
    renderApp(<Sidebar />);
    expect(screen.getByText("Bemorlar ro'yxati")).toBeInTheDocument(); // patient.view bor
    expect(screen.queryByText('Kassa')).toBeNull(); // cashier.view yo'q
  });

  it("FUTURE (disabled) element ko'rsatadi, aria-disabled bilan", () => {
    renderApp(<Sidebar />);
    const payroll = screen.getByText('Ish haqi');
    expect(payroll.closest('[aria-disabled="true"]')).not.toBeNull();
  });

  it("guruh sarlavhasini ko'rsatadi", () => {
    renderApp(<Sidebar />);
    expect(screen.getByText('Bemorlar')).toBeInTheDocument(); // group.patients
  });
});
