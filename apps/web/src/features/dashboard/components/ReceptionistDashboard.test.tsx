import { fireEvent, screen } from '@testing-library/react';
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
        patientId: 'p1',
        doctorId: 'd1',
        status: 'scheduled',
        startTime: '2026-06-22T09:00:00.000Z',
        endTime: '2026-06-22T09:30:00.000Z',
      },
      {
        id: 'a2',
        patientId: 'p2',
        doctorId: 'd2',
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
      {
        id: 'q1',
        queueNumber: 7,
        status: 'waiting',
        patientId: 'p1',
        createdAt: new Date(Date.now() - 22 * 60000).toISOString(),
      },
      { id: 'q2', queueNumber: 8, status: 'in_progress' },
    ],
  }),
}));

// UI-R1: yangi hooklar (ismlar, diqqat manbalari, shifokorlar, qidiruv) — alohida modul.
const confirmMutate = vi.fn();
const declineMutate = vi.fn();
const bookingRequests: { items: Record<string, unknown>[]; pendingCount: number } = {
  items: [],
  pendingCount: 0,
};
const attention = {
  doctorsWithoutSchedule: [{ id: 'd2', name: 'Dr. Nazarov' }] as { id: string; name: string }[],
  overdueLabs: 1,
  recallOverdue: 7,
};
vi.mock('../reception.api.ts', () => ({
  usePatientNames: () => new Map([['p1', 'Jasur Tursunov']]),
  useDoctorOptions: () => ({
    data: [
      { id: 'd1', name: 'Dr. Karimov' },
      { id: 'd2', name: 'Dr. Nazarov' },
    ],
  }),
  useReceptionAttention: () => attention,
  usePatientSearch: () => ({ data: { items: [] }, isFetching: false }),
  useBookingRequests: () => ({ data: bookingRequests, isLoading: false }),
  useConfirmBookingRequest: () => ({ mutate: confirmMutate, isPending: false }),
  useDeclineBookingRequest: () => ({ mutate: declineMutate, isPending: false }),
}));

afterEach(() => {
  attention.doctorsWithoutSchedule = [{ id: 'd2', name: 'Dr. Nazarov' }];
  attention.overdueLabs = 1;
  attention.recallOverdue = 7;
  bookingRequests.items = [];
  bookingRequests.pendingCount = 0;
  confirmMutate.mockClear();
  declineMutate.mockClear();
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

  it('UI-R1: bemor ismi, har qatorda bitta amal va Telegram bo‘sh holat', async () => {
    const { ReceptionistDashboard } = await import('./ReceptionistDashboard.tsx');
    renderApp(<ReceptionistDashboard />);

    expect(screen.getAllByText('Jasur Tursunov').length).toBeGreaterThan(0);
    // scheduled → «Navbatga» (/queue); no_show → «Qayta yozish»; completed → «Kassa»
    expect(screen.getByRole('link', { name: 'Navbatga' })).toHaveAttribute('href', '/queue');
    expect(screen.getByRole('link', { name: 'Qayta yozish' })).toHaveAttribute(
      'href',
      '/appointments',
    );
    expect(screen.getByText(/So'rovlar hozircha yo'q/)).toBeInTheDocument();
    // navbatdagi kutish matn bilan
    expect(screen.getAllByText(/22/).length).toBeGreaterThan(0);
  });

  it('UI-R1: diqqat paneli ≤3 + «yana N ta» (jadvalsiz shifokor, lab, recall)', async () => {
    attention.doctorsWithoutSchedule = [
      { id: 'd2', name: 'Dr. Nazarov' },
      { id: 'd3', name: 'Dr. Rasulova' },
    ];
    const { ReceptionistDashboard } = await import('./ReceptionistDashboard.tsx');
    renderApp(<ReceptionistDashboard />);

    expect(screen.getByText(/Dr\. Nazarov uchun ish jadvali yo/)).toBeInTheDocument();
    expect(screen.getByText('Yana 1 ta')).toBeInTheDocument();
  });

  it("UI-R1: status filtri URL param'dan (?status=no_show)", async () => {
    const { ReceptionistDashboard } = await import('./ReceptionistDashboard.tsx');
    renderApp(<ReceptionistDashboard />, { route: '/?status=no_show' });

    expect(screen.getByText('Kelmagan')).toBeInTheDocument();
    expect(screen.queryByText('Rejalashtirilgan')).not.toBeInTheDocument();
  });

  const req = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    status: 'pending',
    requestedStart: '2026-06-22T14:00:00.000Z',
    createdAt: '2026-06-22T08:00:00.000Z',
    branchId: 'b1',
    branchName: 'Markaz',
    patientId: 'p1',
    patientName: 'Dilnoza Karimova',
    doctorId: null,
    doctorName: null,
    rescheduleOfAppointmentId: null,
    appointmentId: null,
    declineReason: null,
    ...extra,
  });

  it('UI-T2: Telegram so‘rovlari ro‘yxati, KPI soni, Tasdiqlash chaqiruvi', async () => {
    bookingRequests.items = [req('r1'), req('r2', { patientName: 'Aziza Yusupova' })];
    bookingRequests.pendingCount = 2;
    const { ReceptionistDashboard } = await import('./ReceptionistDashboard.tsx');
    renderApp(<ReceptionistDashboard />);

    expect(screen.getByText('Dilnoza Karimova')).toBeInTheDocument();
    expect(screen.getByText('Aziza Yusupova')).toBeInTheDocument();
    expect(screen.queryByText(/So'rovlar hozircha yo'q/)).not.toBeInTheDocument();
    const confirms = screen.getAllByRole('button', { name: 'Tasdiqlash' });
    expect(confirms).toHaveLength(2);
    fireEvent.click(confirms[0] as HTMLElement);
    expect(confirmMutate).toHaveBeenCalledWith({ id: 'r1' });
  });

  it('UI-T2: Rad etish sabab so‘raydi; sababsiz yuborilmaydi', async () => {
    bookingRequests.items = [req('r1')];
    bookingRequests.pendingCount = 1;
    const { ReceptionistDashboard } = await import('./ReceptionistDashboard.tsx');
    renderApp(<ReceptionistDashboard />);

    fireEvent.click(screen.getByRole('button', { name: 'Rad etish' }));
    const submit = screen.getByRole('button', { name: 'Rad etishni yuborish' });
    fireEvent.click(submit);
    expect(declineMutate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Rad etish sababi'), {
      target: { value: 'Shifokor yo‘q' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rad etishni yuborish' }));
    expect(declineMutate).toHaveBeenCalledWith({ id: 'r1', reason: 'Shifokor yo‘q' });
  });

  it('UI-T2: appointment.create yo‘q rolda tugmalar yashirin (ro‘yxat ko‘rinadi)', async () => {
    bookingRequests.items = [req('r1')];
    bookingRequests.pendingCount = 1;
    mockHasPermission.mockImplementation((p) => p !== 'appointment.create');
    const { ReceptionistDashboard } = await import('./ReceptionistDashboard.tsx');
    renderApp(<ReceptionistDashboard />);

    expect(screen.getByText('Dilnoza Karimova')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tasdiqlash' })).not.toBeInTheDocument();
  });
});
