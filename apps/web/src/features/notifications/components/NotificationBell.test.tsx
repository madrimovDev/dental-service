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

describe("NotificationBell — mark-all-read tugma ko'rinishi", () => {
  beforeEach(() => {
    markReadMutate.mockClear();
    markAllReadMutate.mockClear();
  });

  it("unreadCount=0 bo'lsa \"Hammasini o'qilgan deb belgilash\" tugmasi yo'q", async () => {
    mockData = { data: [], unreadCount: 0 };
    renderApp(<NotificationBell />);
    fireEvent.click(screen.getByLabelText('Bildirishnomalar'));
    await screen.findByText("Bildirishnomalar yo'q"); // dropdown ochilgani (empty state) tasdiqlanadi
    expect(screen.queryByText("Hammasini o'qilgan deb belgilash")).toBeNull();
  });

  it("unreadCount>0 bo'lsa tugma bor va bosilganda markAllRead.mutate chaqiriladi", async () => {
    mockData = {
      data: [
        {
          id: 'n1',
          title: 'Test',
          body: null,
          readAt: null,
          createdAt: '2026-07-01T08:00:00.000Z',
        },
      ],
      unreadCount: 1,
    };
    renderApp(<NotificationBell />);
    fireEvent.click(screen.getByLabelText('Bildirishnomalar'));
    const btn = await screen.findByText("Hammasini o'qilgan deb belgilash");
    fireEvent.click(btn);
    expect(markAllReadMutate).toHaveBeenCalledTimes(1);
    expect(markAllReadMutate).toHaveBeenCalledWith();
  });
});

describe("NotificationBell — o'qilgan/o'qilmagan qator farqi", () => {
  beforeEach(() => {
    markReadMutate.mockClear();
    markAllReadMutate.mockClear();
  });

  it("o'qilmagan qator (readAt=null) data-unread bilan belgilanadi va bosilganda markRead.mutate(id) chaqiradi", async () => {
    mockData = {
      data: [
        {
          id: 'unread-1',
          title: 'Unread item',
          body: null,
          readAt: null,
          createdAt: '2026-07-01T08:00:00.000Z',
        },
      ],
      unreadCount: 1,
    };
    renderApp(<NotificationBell />);
    fireEvent.click(screen.getByLabelText('Bildirishnomalar'));
    const row = await screen.findByText('Unread item');
    const rowButton = row.closest('button');
    expect(rowButton).toHaveAttribute('data-unread', 'true');

    fireEvent.click(rowButton!);
    expect(markReadMutate).toHaveBeenCalledWith('unread-1');
  });

  it("o'qilgan qator (readAt bor) data-unread'siz va bosilganda markRead.mutate chaqirilmaydi", async () => {
    mockData = {
      data: [
        {
          id: 'read-1',
          title: 'Read item',
          body: null,
          readAt: '2026-06-30T08:00:00.000Z',
          createdAt: '2026-07-01T08:00:00.000Z',
        },
      ],
      unreadCount: 0,
    };
    renderApp(<NotificationBell />);
    fireEvent.click(screen.getByLabelText('Bildirishnomalar'));
    const row = await screen.findByText('Read item');
    const rowButton = row.closest('button');
    expect(rowButton).not.toHaveAttribute('data-unread');

    fireEvent.click(rowButton!);
    expect(markReadMutate).not.toHaveBeenCalled();
  });
});
