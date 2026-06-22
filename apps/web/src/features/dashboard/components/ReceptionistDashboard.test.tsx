import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';

// --- Mocklar (T5 characterization: re-skin xulqni o'zgartirmaydi) ---

const mockHasPermission = vi.fn((_p: string) => true);

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    activeBranchId: 'b1',
    hasPermission: (p: string) => mockHasPermission(p),
  }),
}));

// Faqat bugungi oraliq — logika hook'i o'zgarmaydi (data-gap qulfi).
vi.mock('../dashboard.api.ts', () => ({
  useTodayRange: () => ({ from: '2026-06-22', to: '2026-06-22' }),
}));

// 3 ta qabul: 1 ta no_show, 1 ta scheduled, 1 ta completed (har biri o'qiladigan vaqt).
vi.mock('@/features/appointments/appointments.api.ts', () => ({
  useAppointments: () => ({
    data: [
      {
        id: 'a1',
        status: 'scheduled',
        startTime: '2026-06-22T09:00:00.000Z',
        endTime: '2026-06-22T09:30:00.000Z',
      },
      {
        id: 'a2',
        status: 'no_show',
        startTime: '2026-06-22T10:00:00.000Z',
        endTime: '2026-06-22T10:30:00.000Z',
      },
      {
        id: 'a3',
        status: 'completed',
        startTime: '2026-06-22T11:00:00.000Z',
        endTime: '2026-06-22T11:30:00.000Z',
      },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

// 2 ta navbat (1 waiting) — KPI count = 2, waiting pill = 1.
vi.mock('@/features/queue/queue.api.ts', () => ({
  useQueueToday: () => ({
    data: [
      { id: 'q1', queueNumber: 7, status: 'waiting' },
      { id: 'q2', queueNumber: 8, status: 'in_progress' },
    ],
  }),
}));

afterEach(() => {
  mockHasPermission.mockClear();
  mockHasPermission.mockImplementation(() => true);
});

describe('ReceptionistDashboard (DS1-T5 re-skin characterization)', () => {
  it('KPI qiymatlari (qabul/no-show/navbat) re-skin keyin ham render bo‘ladi', async () => {
    const { ReceptionistDashboard } = await import('./ReceptionistDashboard.tsx');
    renderApp(<ReceptionistDashboard />);

    // today_total = 3 qabul, no_show = 1, queue = 2 → har raqam ko'rinadi (distinct).
    expect(screen.getByText('3')).toBeInTheDocument();
    // no_show (1) va waiting pill (1) ikkalasi "1" → kamida bitta "1" KPI ko'rinadi
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    expect(screen.getByText('2')).toBeInTheDocument();

    // KPI label'lari (real i18n)
    expect(screen.getByText('Bugun jami')).toBeInTheDocument();
    expect(screen.getByText('Kelmaganlar')).toBeInTheDocument();
  });

  it('jadval qatorlari (vaqt + status chip) re-skin keyin ham render bo‘ladi', async () => {
    const { ReceptionistDashboard } = await import('./ReceptionistDashboard.tsx');
    renderApp(<ReceptionistDashboard />);

    // ScheduleList status label'lari (real appointments.status.* i18n) — 3 qator
    expect(screen.getByText('Rejalashtirilgan')).toBeInTheDocument();
    expect(screen.getByText('Kelmagan')).toBeInTheDocument();
    expect(screen.getByText('Bajarilgan')).toBeInTheDocument();
  });

  it('navbat rail qatorlari (raqam + status) re-skin keyin ham render bo‘ladi', async () => {
    const { ReceptionistDashboard } = await import('./ReceptionistDashboard.tsx');
    renderApp(<ReceptionistDashboard />);

    // QueueCard raqam badge'lari
    expect(screen.getByText('#7')).toBeInTheDocument();
    expect(screen.getByText('#8')).toBeInTheDocument();
    // navbat status label'lari (real queue.* i18n: waiting=Kutmoqda)
    expect(screen.getByText('Kutmoqda')).toBeInTheDocument();
  });

  it('ruxsat bo‘lganda «Yangi yozilish» + «Kassa» tugmalarini ko‘rsatadi', async () => {
    const { ReceptionistDashboard } = await import('./ReceptionistDashboard.tsx');
    renderApp(<ReceptionistDashboard />);

    expect(screen.getByText('Yangi yozilish').closest('a')).toHaveAttribute(
      'href',
      '/appointments',
    );
    expect(screen.getByText('Kassa').closest('a')).toHaveAttribute('href', '/cashier');
  });

  it('appointment/cashier ruxsati yo‘q rolda tugmalar ko‘rinmaydi', async () => {
    mockHasPermission.mockImplementation(() => false);
    const { ReceptionistDashboard } = await import('./ReceptionistDashboard.tsx');
    renderApp(<ReceptionistDashboard />);

    expect(screen.queryByText('Yangi yozilish')).not.toBeInTheDocument();
    expect(screen.queryByText('Kassa')).not.toBeInTheDocument();
    // jadval qatori hali ham render bo'ladi (xulq saqlanadi)
    expect(screen.getByText('Rejalashtirilgan')).toBeInTheDocument();
  });
});
