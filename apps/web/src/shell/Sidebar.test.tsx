import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { Sidebar } from './Sidebar';

let mockPermissions: string[] = [];
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (p: string) => mockPermissions.includes('@owner') || p === 'patient.view',
    permissions: mockPermissions,
    activeBranchId: 'b1',
  }),
}));

afterEach(() => {
  mockPermissions = [];
});

describe('Sidebar', () => {
  it("ruxsatli LIVE element ko'rsatadi, ruxsatsizni yashiradi", () => {
    renderApp(<Sidebar />);
    expect(screen.getByText("Bemorlar ro'yxati")).toBeInTheDocument(); // patient.view bor
    expect(screen.queryByText('Kassa')).toBeNull(); // cashier.view yo'q
  });

  it('FUTURE (disabled) element non-owner uchun yashirin (CLI-161)', () => {
    renderApp(<Sidebar />);
    expect(screen.queryByText('Ish haqi')).toBeNull(); // payroll FUTURE — owner emas
  });

  it("FUTURE (disabled) element owner uchun aria-disabled bilan ko'rinadi (CLI-161)", () => {
    mockPermissions = ['@owner'];
    renderApp(<Sidebar />);
    const payroll = screen.getByText('Ish haqi');
    expect(payroll.closest('[aria-disabled="true"]')).not.toBeNull();
  });

  it("guruh sarlavhasini ko'rsatadi", () => {
    renderApp(<Sidebar />);
    expect(screen.getByText('Bemorlar')).toBeInTheDocument(); // group.patients
  });
});
