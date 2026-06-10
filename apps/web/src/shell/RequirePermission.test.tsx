import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { RequirePermission } from './RequirePermission';

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: (p: string) => p === 'patient.view' }),
}));

function tree() {
  return (
    <Routes>
      <Route
        path="/ok"
        element={
          <RequirePermission perm="patient.view">
            <div>RUXSAT BOR</div>
          </RequirePermission>
        }
      />
      <Route
        path="/no"
        element={
          <RequirePermission perm="cashier.view">
            <div>YOPIQ</div>
          </RequirePermission>
        }
      />
      <Route path="/403" element={<div>403 EKRAN</div>} />
    </Routes>
  );
}

describe('RequirePermission', () => {
  it('ruxsat bor → children', () => {
    renderApp(tree(), { route: '/ok' });
    expect(screen.getByText('RUXSAT BOR')).toBeInTheDocument();
  });
  it("ruxsat yo'q → /403 redirect", () => {
    renderApp(tree(), { route: '/no' });
    expect(screen.getByText('403 EKRAN')).toBeInTheDocument();
    expect(screen.queryByText('YOPIQ')).toBeNull();
  });
});
