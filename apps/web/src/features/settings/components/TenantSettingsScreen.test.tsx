import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { TenantSettingsScreen } from './TenantSettingsScreen';

const updateMutate = vi.fn();
const updateSettingsMutate = vi.fn();

// Stable references — `useEffect([data])` hydratsiya aks holda har render'da yangi
// obyekt referensiyasidan cheksiz qayta-render qiladi (real TanStack hook'lar barqaror).
const tenantData = {
  id: 't1',
  name: 'Klinika A',
  slug: 'klinika-a',
  defaultLanguage: 'uz',
  subscriptionStatus: 'active',
  ownerUserId: 'owner',
};
const settingsData = { vertical: 'dental', currency: 'UZS', reminderLeadHours: 24 };
const transferMutate = vi.fn();

vi.mock('../settings.api', () => ({
  useTenant: () => ({ isLoading: false, data: tenantData }),
  useTenantSettings: () => ({ isLoading: false, data: settingsData }),
  useUpdateTenant: () => ({ mutate: updateMutate, isPending: false }),
  useUpdateTenantSettings: () => ({ mutate: updateSettingsMutate, isPending: false }),
  useTransferOwnership: () => ({ mutate: transferMutate, isPending: false }),
  useUsers: () => ({ data: [] }),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true, user: { id: 'owner' } }),
}));

describe('TenantSettingsScreen', () => {
  it('vertical segmented toggle form qiymatini "general"ga o\'zgartiradi va Saqlash mutate chaqiradi', () => {
    updateMutate.mockClear();
    updateSettingsMutate.mockClear();
    renderApp(<TenantSettingsScreen />);

    // Segmented toggle: dental boshlang'ich active.
    const dentalBtn = screen.getByRole('button', { name: 'Stomatologiya' });
    const generalBtn = screen.getByRole('button', { name: 'Umumiy klinika' });
    expect(dentalBtn).toHaveAttribute('aria-pressed', 'true');
    expect(generalBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(generalBtn);
    expect(generalBtn).toHaveAttribute('aria-pressed', 'true');
    expect(dentalBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Saqlash' }));
    expect(updateSettingsMutate).toHaveBeenCalledWith(
      expect.objectContaining({ vertical: 'general' }),
    );
    // tenant.edit forma ham saqlanadi (ikki mutatsiya bitta tugmadan).
    expect(updateMutate).toHaveBeenCalled();
  });

  it("preserve guard: currency, reminder va transfer karta hali render bo'ladi (#33)", () => {
    renderApp(<TenantSettingsScreen />);
    expect(screen.getByDisplayValue('UZS')).toBeInTheDocument();
    expect(screen.getByLabelText('Eslatma oldindan (soat)')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: "Egalikni o'tkazish" }).length).toBeGreaterThan(0);
  });

  it("subscription holati StatusPill orqali ko'rinadi", () => {
    renderApp(<TenantSettingsScreen />);
    expect(screen.getByText('active')).toBeInTheDocument();
  });
});
