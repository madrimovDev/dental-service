import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test-utils';
import { Topbar } from './Topbar';

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    user: { fullName: 'Firdavs Tursunov', phone: '+998901234567' },
    refreshToken: 'r',
    clear: vi.fn(),
  }),
}));

vi.mock('@/features/notifications/notifications.api.ts', () => ({
  useNotifications: () => ({ data: { data: [], unreadCount: 0 }, isLoading: false }),
  useMarkRead: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkAllRead: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('Topbar', () => {
  it("foydalanuvchi ismini va qidiruvni ko'rsatadi", () => {
    renderApp(<Topbar onBurger={() => {}} burgerOpened={false} />);
    expect(screen.getByText('Firdavs Tursunov')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Bemor, yozuv/)).toBeInTheDocument();
  });

  it('bildirishnoma va theme tugmalari (aria-label) bor', () => {
    renderApp(<Topbar onBurger={() => {}} burgerOpened={false} />);
    expect(screen.getByLabelText('Bildirishnomalar')).toBeInTheDocument();
  });
});
