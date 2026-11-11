import { ApiError } from '@dental/api-client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { NewAppointmentWizard } from './NewAppointmentWizard';

const createMock = vi.hoisted(() => vi.fn());
const bookingCtx = vi.hoisted(() => ({
  data: { openLabOrders: [], nextPlanStage: null } as {
    openLabOrders: {
      id: string;
      labName: string;
      orderType: string;
      status: string;
      expectedDate: string | null;
    }[];
    nextPlanStage: null | {
      planId: string;
      planTitle: string;
      doctorId: string;
      stageId: string;
      sequence: number;
      serviceId: string | null;
      serviceName: string;
      estimatedDurationMinutes: number | null;
    };
  },
}));
const availabilityMock = vi.hoisted(() => ({
  data: {
    doctorId: 'd1',
    branchId: 'b1',
    date: '2026-06-20',
    slotMinutes: 30,
    slots: [
      // 2026-06-20T04:00:00Z = 09:00 Tashkent
      { start: '2026-06-20T04:00:00.000Z', end: '2026-06-20T04:30:00.000Z' },
      { start: '2026-06-20T04:30:00.000Z', end: '2026-06-20T05:00:00.000Z' },
    ],
    unavailable: [
      { start: '2026-06-20T05:00:00.000Z', end: '2026-06-20T05:30:00.000Z', reason: 'busy' },
      { start: '2026-06-20T08:00:00.000Z', end: '2026-06-20T08:30:00.000Z', reason: 'lunch' },
    ] as { start: string; end: string; reason: string }[],
  },
  isLoading: false,
}));

vi.mock('../appointments.api', () => ({
  useCreateAppointment: () => ({ mutate: createMock, isPending: false }),
  useDoctors: () => ({ data: [{ id: 'd1', name: 'Dr. Ali' }] }),
  useServices: () => ({
    data: [
      { id: 's1', nameUz: 'Tekshiruv', durationMinutes: 30 },
      { id: 's2', nameUz: 'Tozalash', durationMinutes: 30 },
    ],
  }),
  useBookingContext: () => ({ data: bookingCtx.data }),
  useBranches: () => ({ data: [{ id: 'b1', name: 'Markaziy filial' }] }),
}));
vi.mock('@/features/schedule/schedule.api', () => ({
  useAvailability: () => availabilityMock,
}));
// usePatients chaqiruv argumentini (search) kuzatamiz — CLI-454: debounced server-search
// pageSize:100 bilan cheklangan static ro'yxat o'rniga.
const usePatientsSpy = vi.hoisted(() =>
  vi.fn((_params?: unknown) => ({
    data: { items: [{ id: 'p1', fullName: 'Aliyev Vali' }], meta: {} },
  })),
);
vi.mock('@/features/patients', () => ({
  usePatients: (params: unknown) => usePatientsSpy(params),
}));
vi.mock('@/lib/api.ts', () => ({
  api: {
    patients: { list: vi.fn(() => Promise.resolve({ data: [], meta: {} })) },
    services: { list: vi.fn(() => Promise.resolve([])) },
    branches: { list: vi.fn(() => Promise.resolve([])) },
  },
}));
// debounce'ni o'tkazib, qidiruv darhol uzatilsin (CommandPalette.test.tsx naqshi).
vi.mock('@mantine/hooks', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useDebouncedValue: (v: unknown) => [v] };
});

const mockAuth = vi.hoisted(() => ({ activeBranchId: 'b1' as string | null }));
vi.mock('@/stores/auth-store.ts', () => ({ useAuthStore: () => mockAuth }));

describe('NewAppointmentWizard', () => {
  afterEach(() => {
    mockAuth.activeBranchId = 'b1';
    createMock.mockReset();
    bookingCtx.data = { openLabOrders: [], nextPlanStage: null };
    usePatientsSpy.mockClear();
  });

  // CLI-454: avval bemor Select faqat oldindan yuklangan (pageSize:100, qidiruvsiz)
  // ro'yxatni client-side filtrlar edi — 100 tadan ortiq bemorli tenant'da yangi/eski
  // bemorlar ko'rinmasdi. Endi qidiruv matni debounced holda `usePatients`ga uzatiladi.
  it("bemor qidiruv input o'zgarganda usePatients debounced search bilan chaqiriladi", async () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText('Bemor');
    fireEvent.change(input, { target: { value: 'Vali' } });
    await waitFor(() =>
      expect(usePatientsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Vali', page: 1, pageSize: 100 }),
      ),
    );
  });

  it("4 bo'lim bitta ekranda ko'rinadi", () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    for (const h of ['Bemor', 'Xizmat', 'Shifokor', 'Vaqt'])
      expect(screen.getByRole('heading', { name: new RegExp(h) })).toBeInTheDocument();
  });

  it("branch-bound foydalanuvchida filial Select ko'rsatilmaydi", () => {
    mockAuth.activeBranchId = 'b1';
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    expect(screen.queryByText('Filial')).not.toBeInTheDocument();
  });

  it("tenant-wide foydalanuvchida (activeBranchId=null) filial Select ko'rsatiladi (CLI-151)", () => {
    mockAuth.activeBranchId = null;
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    expect(screen.getByText('Filial')).toBeInTheDocument();
  });

  async function selectPatient() {
    const input = screen.getByPlaceholderText('Bemor');
    fireEvent.click(input);
    fireEvent.click(await screen.findByText('Aliyev Vali'));
  }
  const pickDoctor = () => fireEvent.click(screen.getByRole('button', { name: 'Dr. Ali' }));
  const pickService = () => fireEvent.click(screen.getByRole('button', { name: /Tekshiruv/ }));

  async function fillAll() {
    await selectPatient();
    pickDoctor();
    pickService();
    fireEvent.click(await screen.findByRole('button', { name: '09:00' }));
  }

  it("xizmat va shifokor tanlangach bo'sh slotlar ko'rsatiladi (Tashkent HH:mm)", async () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    pickDoctor();
    pickService();
    expect(await screen.findByRole('button', { name: '09:00' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '09:30' })).toBeInTheDocument();
  });

  it("yo'q slot yonida sabab ko'rinadi va bosib bo'lmaydi (SC-07)", async () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    pickDoctor();
    pickService();
    const busy = await screen.findByRole('button', { name: /10:00.*band/ });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: /13:00.*tushlik/ })).toBeInTheDocument();
  });

  it("workHoursConfigured=false bo'lsa «ish soati sozlanmagan» xabari (P10)", async () => {
    const prev = availabilityMock.data;
    availabilityMock.data = {
      ...prev,
      slots: [],
      unavailable: [],
      workHoursConfigured: false,
    } as typeof prev;
    try {
      renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
      pickDoctor();
      pickService();
      expect(
        await screen.findByText('Filial ish soati sozlanmagan — Sozlamalar → Filiallar'),
      ).toBeInTheDocument();
    } finally {
      availabilityMock.data = prev;
    }
  });

  it("slot tanlanmaguncha «Yozish» o'chiq; tanlangach yoqiladi va eslatma matni chiqadi", async () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    await selectPatient();
    pickDoctor();
    pickService();
    const submitBtn = screen.getByRole('button', { name: 'Yozish' });
    expect(submitBtn).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: '09:00' }));
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    expect(screen.getByText(/Assalomu alaykum, Aliyev!/)).toBeInTheDocument();
  });

  it("tanlangan slot startTime/endTime'ni submit'ga uzatadi", async () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    await fillAll();
    fireEvent.click(screen.getByRole('button', { name: 'Yozish' }));
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: 'p1',
        doctorId: 'd1',
        startTime: '2026-06-20T04:00:00.000Z',
        endTime: '2026-06-20T04:30:00.000Z',
      }),
      expect.anything(),
    );
  });

  it("lab muddati yozilishdan keyin bo'lsa ogohlantirish ko'rinadi", async () => {
    bookingCtx.data = {
      openLabOrders: [
        {
          id: 'l1',
          labName: 'Best Lab',
          orderType: 'crown',
          status: 'sent',
          expectedDate: '2099-01-01T00:00:00.000Z',
        },
      ],
      nextPlanStage: null,
    };
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    await fillAll();
    expect(await screen.findByText(/Lab ishi: Best Lab/)).toBeInTheDocument();
  });

  it("reja bosqichi taklifi «Rejadan tanlash» xizmat va shifokorni to'ldiradi", async () => {
    bookingCtx.data = {
      openLabOrders: [],
      nextPlanStage: {
        planId: 'pl',
        planTitle: 'Protez',
        doctorId: 'd1',
        stageId: 'st',
        sequence: 3,
        serviceId: 's1',
        serviceName: "Toj o'rnatish",
        estimatedDurationMinutes: 60,
      },
    };
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    await selectPatient();
    fireEvent.click(await screen.findByRole('button', { name: 'Rejadan tanlash' }));
    expect(await screen.findByRole('button', { name: '09:00' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tekshiruv/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  // A10: backend 409 kodlari alohida xabarga aylanadi.
  it('409 conflict.doctor_busy — "Doktor bu vaqtda band" xabari', async () => {
    createMock.mockImplementation((_body, opts) =>
      opts.onError(new ApiError('conflict.doctor_busy', 'busy', 409)),
    );
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    await fillAll();
    fireEvent.click(screen.getByRole('button', { name: 'Yozish' }));
    expect(await screen.findByText('Doktor bu vaqtda band')).toBeInTheDocument();
  });

  it('409 schedule.outside_working_hours — ish-soati xabari (conflict emas)', async () => {
    createMock.mockImplementation((_body, opts) =>
      opts.onError(new ApiError('schedule.outside_working_hours', 'oow', 409)),
    );
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    await fillAll();
    fireEvent.click(screen.getByRole('button', { name: 'Yozish' }));
    expect(await screen.findByText('Bu vaqt doktor ish jadvalidan tashqarida')).toBeInTheDocument();
    expect(screen.queryByText('Doktor bu vaqtda band')).not.toBeInTheDocument();
  });

  it('tanish bo\'lmagan xato kodi — generik "Xatolik yuz berdi"', async () => {
    createMock.mockImplementation((_body, opts) =>
      opts.onError(new ApiError('insert.failed', 'x', 400)),
    );
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    await fillAll();
    fireEvent.click(screen.getByRole('button', { name: 'Yozish' }));
    expect(await screen.findByText('Xatolik yuz berdi')).toBeInTheDocument();
  });

  it("patientId'siz submit server'ga ketmaydi (inline validatsiya)", async () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    pickDoctor();
    pickService();
    fireEvent.click(await screen.findByRole('button', { name: '09:00' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yozish' }));
    expect(createMock).not.toHaveBeenCalled();
  });

  it("baza (xizmat davomiyligi) o'zgarsa tanlangan slot tozalanadi (stale-guard)", async () => {
    renderApp(<NewAppointmentWizard onClose={vi.fn()} />);
    pickDoctor();
    pickService();
    fireEvent.click(await screen.findByRole('button', { name: '09:00' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yozish' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Tozalash/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Yozish' })).toBeDisabled());
  });
});
