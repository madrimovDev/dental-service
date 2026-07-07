import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { ReportsScreen } from './ReportsScreen';

// Barcha report hook'lari — ma'lumotli holat (KPI + BarMini chrome ko'rinishi uchun).
vi.mock('../reports.api', () => ({
  useRevenueReport: () => ({
    data: {
      total: 1500000,
      byBranch: [],
      byService: [{ serviceName: 'Plomba', total: 600000 }],
      byDoctor: [],
      byPeriod: [{ date: '2026-06-01', total: 500000 }],
      byPaymentMethod: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAppointmentStats: () => ({
    data: {
      total: 40,
      byStatus: [{ status: 'completed', count: 30 }],
      noShowRate: 0.1,
      slotUtilization: 0.75,
      occupancy: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useDoctorWorkload: () => ({
    data: [{ doctorId: 'd1', total: 10, completed: 8 }],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  usePlanCompletion: () => ({
    data: { totalStages: 20, completedStages: 12, rate: 0.6, byStatus: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useDentalAnalytics: () => ({
    data: {
      // CLI-450: nom atayin `revenue.data.byService`dagi 'Plomba'dan farqli — ikkalasi
      // ham bir sahifada BarMini ("Top xizmatlar") va yangi Table (procedureMix)
      // orqali render qilinadi, bir xil nom bo'lsa `getByText` ko'p element topib xato beradi.
      procedureMix: [
        {
          serviceName: 'Kanal davolash',
          count: 10,
          revenue: 500000,
          materialCost: 200000,
          margin: 300000,
          marginPct: 0.6,
        },
      ],
      retention: { newPatients: 5, returningPatients: 3, retentionRate: 0.6 },
      recallEfficacy: { converted: 2, total: 4, efficacy: 0.5 },
      noShowByWeekday: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useOneCExport: () => ({ data: undefined, isFetching: false, refetch: vi.fn() }),
}));
vi.mock('@/features/appointments/appointments.api', () => ({
  useDoctors: () => ({ data: [{ id: 'd1', name: 'Dr. Ali' }] }),
}));
vi.mock('@/features/queue/queue.api.ts', () => ({
  useBranches: () => ({ data: [] }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('ReportsScreen (DS8 re-skin)', () => {
  it('renders PageHead title + 4 KPI StatCards + revenue-trend/top-services chrome', () => {
    renderApp(<ReportsScreen />);
    // PageHead — h1 sarlavha
    expect(screen.getByRole('heading', { level: 1, name: 'Hisobotlar' })).toBeInTheDocument();
    // 4 KPI qiymatlari ko'rinadi
    expect(screen.getByText('10.0%')).toBeInTheDocument(); // no-show
    expect(screen.getByText('75.0%')).toBeInTheDocument(); // utilization
    expect(screen.getByText('40')).toBeInTheDocument(); // appointments total
    // titlangan grafik chrome
    expect(screen.getByText('Tushum dinamikasi')).toBeInTheDocument();
    expect(screen.getByText('Top xizmatlar')).toBeInTheDocument();
    // CLI-450: procedureMix jadvali — material xarajati/margin ustunlari
    expect(screen.getByText('Kanal davolash')).toBeInTheDocument();
    expect(screen.getByText('Material xarajati')).toBeInTheDocument();
    expect(screen.getByText('Margin')).toBeInTheDocument();
  });
});
