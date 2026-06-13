import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { AppShell } from './AppShell';

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    user: { fullName: 'F. Tursunov', phone: '+998901234567' },
    hasPermission: (p: string) => p === 'patient.view',
    permissions: [],
    refreshToken: 'r',
    clear: vi.fn(),
    activeBranchId: 'b1',
  }),
}));

describe('AppShell', () => {
  it('topbar + sidebar + outlet render qiladi', () => {
    renderApp(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>SAHIFA TARKIBI</div>} />
        </Route>
      </Routes>,
      { route: '/' },
    );
    expect(screen.getByText('F. Tursunov')).toBeInTheDocument(); // topbar
    expect(screen.getByText("Bemorlar ro'yxati")).toBeInTheDocument(); // sidebar (patient.view)
    expect(screen.getByText('SAHIFA TARKIBI')).toBeInTheDocument(); // outlet
  });
});
