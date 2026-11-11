import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { SettingsShell } from './SettingsShell';

const readinessMock = vi.fn();
vi.mock('../settings.readiness.api', () => ({ useTenantReadiness: () => readinessMock() }));

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
  beforeEach(() => readinessMock.mockReturnValue({ data: undefined }));

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
    // Faqat tenant_settings.view ruxsatli bo’lsa: tenant + notify + integrations ko’rinadi.
    hasPermissionMock.mockImplementation(
      (code: string): boolean => code === 'tenant_settings.view',
    );
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
    // tenant + notify + integrations — uchalasi tenant_settings.view ostida.
    expect(within(nav).getAllByRole('button')).toHaveLength(3);
  });

  it('readiness: N/total, bo’lim badge’i va desktopda zaxira placeholder', async () => {
    hasPermissionMock.mockReturnValue(true);
    readinessMock.mockReturnValue({
      data: {
        items: [
          { key: 'workHours', ok: false },
          { key: 'doctorSchedule', ok: true },
          { key: 'channel', ok: true },
          { key: 'staff', ok: true },
          { key: 'license', ok: true },
          { key: 'backup', ok: false },
        ],
      },
    });
    renderApp(
      <SettingsShell active="tenant">
        <div>content</div>
      </SettingsShell>,
    );
    expect(screen.getByTestId('readiness-count')).toHaveTextContent('4/6');
    // Filiallar: workHours ok emas -> todo badge; Klinika (license): ok
    const nav = screen.getByRole('navigation');
    const branchesBtn = within(nav).getByText('Filiallar').closest('button') as HTMLElement;
    expect(within(branchesBtn).getByTestId('tab-badge-todo')).toBeInTheDocument();
    const tenantBtn = within(nav).getByText('Klinika').closest('button') as HTMLElement;
    expect(within(tenantBtn).getByTestId('tab-badge-ok')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Zaxira nusxa')).toBeInTheDocument());
  });
});
