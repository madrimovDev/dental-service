import { ApiError } from '@dental/api-client';
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { isModuleDisabledError, moduleForPath } from './license-modules';
import { RequireModule } from './RequireModule';

let mockLicense: { data?: { mode: string; state: string; modules: string[] | null } } = {};
vi.mock('@/features/license', () => ({ useLicenseStatus: () => mockLicense }));

afterEach(() => {
  mockLicense = {};
});

const STARTER = ['patients', 'appointments', 'queue', 'staff'];

// FX-127 (LC-05): tarifda yo'q modul sahifasi URL orqali ochilsa — «rolingizga yopiq»
// emas, «tarifingizda yo'q» ekrani.
describe('RequireModule (FX-127)', () => {
  it("starter tarifda /cashier → «tarifingizda yo'q» ekrani, sahifa render qilinmaydi", () => {
    mockLicense = { data: { mode: 'desktop', state: 'active', modules: STARTER } };
    renderApp(
      <RequireModule path="/cashier">
        <div>cashier-page</div>
      </RequireModule>,
    );
    expect(screen.queryByText('cashier-page')).toBeNull();
    expect(screen.getByText("Bu bo'lim tarifingizda yo'q")).toBeInTheDocument();
  });

  it('tarifda bor modul yoki cheklovsiz (null) — sahifa ochiladi', () => {
    mockLicense = { data: { mode: 'desktop', state: 'active', modules: STARTER } };
    renderApp(
      <RequireModule path="/patients/:id">
        <div>patient-page</div>
      </RequireModule>,
    );
    expect(screen.getByText('patient-page')).toBeInTheDocument();

    mockLicense = { data: { mode: 'cloud', state: 'none', modules: null } };
    renderApp(
      <RequireModule path="/cashier">
        <div>cashier-cloud</div>
      </RequireModule>,
    );
    expect(screen.getByText('cashier-cloud')).toBeInTheDocument();
  });
});

describe('license-modules helperlari (FX-127)', () => {
  it('moduleForPath — route pattern → API moduli', () => {
    expect(moduleForPath('/cashier')).toBe('cashier');
    expect(moduleForPath('/transactions')).toBe('cashier');
    expect(moduleForPath('/settings/users')).toBe('staff');
    expect(moduleForPath('/patients/:id/visits/new')).toBe('clinical');
    expect(moduleForPath('/patients/:id/lab-orders/new')).toBe('lab-orders');
    expect(moduleForPath('/patients/:id')).toBe('patients');
    expect(moduleForPath('/schedule')).toBeNull();
    expect(moduleForPath('/')).toBeNull();
  });

  it('isModuleDisabledError — faqat 403 MODULE_DISABLED', () => {
    expect(isModuleDisabledError(new ApiError('MODULE_DISABLED', 'x', 403))).toBe(true);
    expect(isModuleDisabledError(new ApiError('forbidden', 'x', 403))).toBe(false);
    expect(isModuleDisabledError(new Error('x'))).toBe(false);
  });
});
