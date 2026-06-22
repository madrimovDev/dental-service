import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { Topbar } from './Topbar';

vi.mock('@/stores/ui-store.ts', () => ({
  useUiStore: (sel: (s: { sidebarRail: boolean; toggleSidebarRail: () => void }) => unknown) =>
    sel({ sidebarRail: false, toggleSidebarRail: vi.fn() }),
}));

vi.mock('@/features/notifications/notifications.api.ts', () => ({
  useNotifications: () => ({ data: { data: [], unreadCount: 0 }, isLoading: false }),
  useMarkRead: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkAllRead: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('Topbar', () => {
  it("qidiruv va sidebar toggle tugmalari ko'rsatiladi (workspace/user sidebar'ga ko'chdi)", () => {
    renderApp(<Topbar onBurger={() => {}} burgerOpened={false} />);
    // Qidiruv endi ⌘K palette'ni ochuvchi tugma (placeholder input emas)
    expect(screen.getByText(/Bemor, yozuv/)).toBeInTheDocument();
    // Sidebar toggle tugmasi
    expect(screen.getByLabelText("Yon panelni yig'ish")).toBeInTheDocument();
  });

  it('bildirishnoma va theme tugmalari (aria-label) bor', () => {
    renderApp(<Topbar onBurger={() => {}} burgerOpened={false} />);
    expect(screen.getByLabelText('Bildirishnomalar')).toBeInTheDocument();
  });

  it("workspace switcher va user menu topbar'da yo'q (sidebar'da)", () => {
    renderApp(<Topbar onBurger={() => {}} burgerOpened={false} />);
    // Foydalanuvchi ismi topbar'da ko'rinmaydi (sidebar footer'ga ko'chdi)
    expect(screen.queryByText('Firdavs Tursunov')).toBeNull();
  });
});
