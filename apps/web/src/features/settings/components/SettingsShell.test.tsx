import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { SettingsShell } from './SettingsShell';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const hasPermissionMock = vi.fn((_code: string): boolean => true);
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: hasPermissionMock }),
}));

describe('SettingsShell', () => {
  it('left-nav: eyebrow + 6 nav buttonni ko’rsatadi', () => {
    hasPermissionMock.mockReturnValue(true);
    renderApp(
      <SettingsShell active="roles">
        <div>content</div>
      </SettingsShell>,
    );
    const nav = screen.getByRole('navigation');
    // Eyebrow ("Sozlamalar") + 6 nav buttons (4 translated, 2 raw-key until i18n T1 lands).
    expect(within(nav).getByText('Sozlamalar')).toBeInTheDocument();
    expect(within(nav).getByText('Klinika')).toBeInTheDocument();
    expect(within(nav).getByText('Rollar')).toBeInTheDocument();
    expect(within(nav).getByText('Filiallar')).toBeInTheDocument();
    expect(within(nav).getByText('Xodimlar')).toBeInTheDocument();
    expect(within(nav).getAllByRole('button')).toHaveLength(6);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('nav buttoni bosilganda navigate(path) chaqiradi', () => {
    hasPermissionMock.mockReturnValue(true);
    navigateMock.mockClear();
    renderApp(
      <SettingsShell active="tenant">
        <div>content</div>
      </SettingsShell>,
    );
    fireEvent.click(screen.getByText('Filiallar'));
    expect(navigateMock).toHaveBeenCalledWith('/settings/branches');
  });

  it('permission yo’q tablarni filtrlaydi', () => {
    // Faqat tenant.view ruxsatli bo’lsa: tenant + notify + integrations ko’rinadi.
    hasPermissionMock.mockImplementation((code: string): boolean => code === 'tenant.view');
    renderApp(
      <SettingsShell active="tenant">
        <div>content</div>
      </SettingsShell>,
    );
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByText('Klinika')).toBeInTheDocument();
    expect(within(nav).queryByText('Rollar')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Filiallar')).not.toBeInTheDocument();
    expect(within(nav).queryByText('Xodimlar')).not.toBeInTheDocument();
    // tenant (1) + notify/integrations gated on tenant_settings.view (0) = 1 visible button.
    expect(within(nav).getAllByRole('button')).toHaveLength(1);
  });
});
