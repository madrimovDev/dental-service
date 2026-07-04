import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/lib/i18n.ts';
import { renderApp } from '../../../test-utils';
import { NotificationBell } from './NotificationBell';

type MockNotification = {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

let mockData: { data: MockNotification[]; unreadCount: number } | undefined;
const markReadMutate = vi.fn();
const markAllReadMutate = vi.fn();

vi.mock('../notifications.api.ts', () => ({
  useNotifications: () => ({ data: mockData, isLoading: false }),
  useMarkRead: () => ({ mutate: markReadMutate, isPending: false }),
  useMarkAllRead: () => ({ mutate: markAllReadMutate, isPending: false }),
}));

afterEach(async () => {
  await i18n.changeLanguage('uz');
});

describe('NotificationBell — unread-count capping', () => {
  beforeEach(() => {
    markReadMutate.mockClear();
    markAllReadMutate.mockClear();
  });

  it("unreadCount=0 bo'lganda badge ko'rsatilmaydi", () => {
    mockData = { data: [], unreadCount: 0 };
    renderApp(<NotificationBell />);
    expect(screen.queryByText('0')).toBeNull();
    expect(screen.queryByText('99+')).toBeNull();
  });

  it('unreadCount=5 bo\'lganda "5" ko\'rsatiladi', () => {
    mockData = { data: [], unreadCount: 5 };
    renderApp(<NotificationBell />);
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('unreadCount=99 bo\'lganda "99" ko\'rsatiladi (chegara, hali cap emas)', () => {
    mockData = { data: [], unreadCount: 99 };
    renderApp(<NotificationBell />);
    expect(screen.getByText('99')).toBeInTheDocument();
    expect(screen.queryByText('99+')).toBeNull();
  });

  it('unreadCount=100 bo\'lganda "99+" ga cap qilinadi', () => {
    mockData = { data: [], unreadCount: 100 };
    renderApp(<NotificationBell />);
    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.queryByText('100')).toBeNull();
  });

  it('unreadCount=150 (ancha katta) baribir "99+"', () => {
    mockData = { data: [], unreadCount: 150 };
    renderApp(<NotificationBell />);
    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.queryByText('150')).toBeNull();
  });
});
