import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { SettingsShell } from './SettingsShell';

const readinessMock = vi.fn();
vi.mock('../settings.readiness.api', () => ({ useTenantReadiness: () => readinessMock() }));

const navDataMock = vi.fn();
vi.mock('../settings.navData', () => ({ useSettingsNavData: () => navDataMock() }));

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
  beforeEach(() => {
    readinessMock.mockReturnValue({ data: undefined });
    navDataMock.mockReturnValue({ pills: {}, showLicense: false, showBackup: false });
  });

  it('left-nav: eyebrow + 7 nav buttonni ko’rsatadi (desktop-faqat bo’limlarsiz)', () => {
    hasPermissionMock.mockReturnValue(true);
    renderApp(
      <SettingsShell active="roles">
        <div>content</div>
      </SettingsShell>,
    );
    const nav = screen.getByRole('navigation');
    // Eyebrow ("Sozlamalar") + 7 nav buttons (litsenziya/zaxira — faqat desktopda).
    expect(within(nav).getByText('Sozlamalar')).toBeInTheDocument();
    expect(within(nav).getByText('Klinika')).toBeInTheDocument();
    expect(within(nav).getByText('Rollar')).toBeInTheDocument();
    expect(within(nav).getByText('Filiallar')).toBeInTheDocument();
    expect(within(nav).getByText('Xodimlar')).toBeInTheDocument();
    expect(within(nav).getByText('Xizmatlar va narxlar')).toBeInTheDocument();
    expect(within(nav).getAllByRole('button')).toHaveLength(7);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('desktopda Litsenziya va Zaxira bo’limlari qo’shiladi, belgilar matn bilan', () => {
    hasPermissionMock.mockReturnValue(true);
    navDataMock.mockReturnValue({
      pills: {
        license: { tone: 'warn', kind: 'days', count: 24 },
        backup: { tone: 'danger', kind: 'days', count: 3 },
        users: { tone: 'neutral', kind: 'count', count: 9 },
      },
      showLicense: true,
      showBackup: true,
    });
    renderApp(
      <SettingsShell active="tenant">
        <div>content</div>
      </SettingsShell>,
    );
    const nav = screen.getByRole('navigation');
    const lic = within(nav).getByText('Litsenziya').closest('button') as HTMLElement;
    expect(within(lic).getByText('24 kun')).toBeInTheDocument();
    const bk = within(nav).getByText('Zaxira nusxa').closest('button') as HTMLElement;
    expect(within(bk).getByText('3 kun')).toBeInTheDocument();
    const users = within(nav).getByText('Xodimlar').closest('button') as HTMLElement;
    expect(within(users).getByText('9')).toBeInTheDocument();
    expect(within(nav).getAllByRole('button')).toHaveLength(9);
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
    // tenant + notify + integrations — uchalasi tenant_settings.view ostida (xizmatlar: service.view).
    expect(within(nav).getAllByRole('button')).toHaveLength(3);
    expect(within(nav).queryByText('Xizmatlar va narxlar')).not.toBeInTheDocument();
  });

  it('readiness: N/total va bo’lim badge’i (Klinika: litsenziya ✓)', () => {
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
    navDataMock.mockReturnValue({ pills: {}, showLicense: false, showBackup: false });
    expect(within(branchesBtn).queryByTestId('tab-badge-todo')).not.toBeInTheDocument();
    const tenantBtn = within(nav).getByText('Klinika').closest('button') as HTMLElement;
    expect(within(tenantBtn).getByTestId('tab-badge-ok')).toBeInTheDocument();
  });
});
