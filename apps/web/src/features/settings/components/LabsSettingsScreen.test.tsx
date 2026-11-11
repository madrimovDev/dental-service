import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { LabsSettingsScreen } from './LabsSettingsScreen';

const connectMutate = vi.fn();
const requestMutate = vi.fn();
const permissions = { current: new Set<string>() };
const status = {
  current: {
    configured: true,
    mode: 'saas' as 'saas' | 'desktop',
    connected: true,
    hubClinicId: 'c1',
    connectedAt: '2026-11-12T08:00:00Z',
    lastPollAt: '2026-11-12T09:00:00Z',
    lastPushAt: null,
    lastError: null as string | null,
    pendingOutbox: 2,
    failedOutbox: 0,
  },
};

vi.mock('../settings.navData', () => ({
  useSettingsNavData: () => ({ pills: {}, showLicense: false, showBackup: false }),
}));
vi.mock('../settings.readiness.api', () => ({
  useTenantReadiness: () => ({ data: { items: [] } }),
}));
vi.mock('@/features/clinical/components/lab-orders/lab-hub.api', () => ({
  useLabHubStatus: () => ({ data: status.current, isError: false }),
  useLabHubLabs: () => ({
    data: {
      stale: false,
      labs: [
        { id: 'l1', name: 'Oq Tish', city: 'Toshkent', description: null, linkStatus: 'active' },
        { id: 'l2', name: 'Dental Pro', city: 'Samarqand', description: null, linkStatus: null },
        { id: 'l3', name: 'Rad Lab', city: null, description: null, linkStatus: 'rejected' },
      ],
    },
    isError: false,
  }),
  useConnectLabHub: () => ({ mutate: connectMutate, isPending: false }),
  useRequestLabLink: () => ({ mutate: requestMutate, isPending: false, variables: undefined }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: Object.assign((sel?: (s: unknown) => unknown) => {
    const state = { hasPermission: (p: string) => permissions.current.has(p) };
    return sel ? sel(state) : state;
  }, {}),
}));

describe('LabsSettingsScreen', () => {
  beforeEach(() => {
    connectMutate.mockReset();
    requestMutate.mockReset();
    status.current = { ...status.current, connected: true, configured: true, lastError: null };
    permissions.current = new Set([
      'tenant_settings.view',
      'tenant_settings.edit',
      'lab_order.view',
    ]);
  });

  it('ulangan: holat, navbat, katalog — ulanmagan/rad etilgan labga so‘rov', () => {
    renderApp(<LabsSettingsScreen />);
    expect(screen.getAllByText('Ulangan').length).toBeGreaterThan(0);
    expect(screen.getByText('kutmoqda: 2 · yuborilmadi: 0')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Laboratoriyalar katalogi' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // Faol ulangan labda so'rov tugmasi yo'q.
    expect(within(rows[0] as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
    fireEvent.click(
      within(rows[1] as HTMLElement).getByRole('button', { name: "Ulanish so'rovi" }),
    );
    expect(requestMutate).toHaveBeenCalledWith('l2', expect.anything());
    expect(
      within(rows[2] as HTMLElement).getByRole('button', { name: "Qayta so'rash" }),
    ).toBeInTheDocument();
  });

  it('ulanmagan: «Portalga ulanish» connect chaqiradi, katalog ko‘rinmaydi', () => {
    status.current = { ...status.current, connected: false };
    renderApp(<LabsSettingsScreen />);
    expect(
      screen.queryByRole('list', { name: 'Laboratoriyalar katalogi' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Portalga ulanish' }));
    expect(connectMutate).toHaveBeenCalled();
  });

  it('tenant_settings.edit yo‘q: ulanish/so‘rov tugmalari yo‘q (faqat ko‘rish)', () => {
    permissions.current = new Set(['tenant_settings.view', 'lab_order.view']);
    renderApp(<LabsSettingsScreen />);
    expect(screen.queryByRole('button', { name: 'Qayta ulanish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Ulanish so'rovi" })).not.toBeInTheDocument();
  });

  it('portal sozlanmagan: ogohlantirish, ulanish tugmasi yo‘q', () => {
    status.current = { ...status.current, configured: false, connected: false };
    renderApp(<LabsSettingsScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('sozlanmagan');
    expect(screen.queryByRole('button', { name: 'Portalga ulanish' })).not.toBeInTheDocument();
  });

  it('oxirgi xato matnli ko‘rinadi (kod emas)', () => {
    status.current = { ...status.current, lastError: 'link.not_active' };
    renderApp(<LabsSettingsScreen />);
    expect(screen.getByText(/tasdiqlagach yuboriladi/)).toBeInTheDocument();
  });
});
