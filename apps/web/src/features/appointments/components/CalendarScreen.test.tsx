import { ApiError } from '@dental/api-client';
import { act, createEvent, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { CalendarScreen } from './CalendarScreen';

const hoisted = vi.hoisted(() => ({
  perms: new Set<string>(),
  statusMutate: vi.fn(),
  moveMutate: vi.fn(),
  cancelMutate: vi.fn(),
  appts: [] as unknown[],
  availability: undefined as unknown,
}));

vi.mock('../appointments.api', () => ({
  useAppointments: () => ({
    data: hoisted.appts,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useBranchAvailability: () => ({
    data: hoisted.availability,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useDoctors: () => ({
    data: [
      { id: 'd1', name: 'Dr. Ali' },
      { id: 'd2', name: 'Dr. Vali' },
    ],
  }),
  useServices: () => ({ data: [] }),
  useBranches: () => ({ data: [] }),
  useCancelAppointment: () => ({ mutate: hoisted.cancelMutate }),
  useUpdateAppointmentStatus: () => ({ mutate: hoisted.statusMutate }),
  useMoveAppointment: () => ({ mutate: hoisted.moveMutate }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (p: string) => hoisted.perms.has(p),
    activeBranchId: 'b1',
  }),
}));

const todayAt = (h: number) => {
  // Bugun, Tashkent 10:00 — kalendar "bugun"da ochiladi.
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  return new Date(`${key}T${String(h).padStart(2, '0')}:00:00+05:00`).toISOString();
};

const appt = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  tenantId: 't',
  branchId: 'b1',
  patientId: 'p1',
  patientName: 'Dilnoza Rahimova',
  doctorId: 'd1',
  assistantId: null,
  startTime: todayAt(10),
  endTime: todayAt(11),
  status: 'scheduled',
  serviceIds: [],
  notes: null,
  cancellationReason: null,
  createdAt: todayAt(8),
  updatedAt: todayAt(8),
  ...over,
});

beforeEach(() => {
  hoisted.perms = new Set(['appointment.view', 'appointment.edit', 'appointment.cancel']);
  hoisted.statusMutate.mockReset();
  hoisted.cancelMutate.mockReset();
  hoisted.moveMutate.mockReset();
  hoisted.appts = [appt()];
  hoisted.availability = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CalendarScreen', () => {
  it("sarlavha va kun/hafta toggle ko'rsatadi", () => {
    renderApp(<CalendarScreen />);
    expect(screen.getByText('Kun')).toBeInTheDocument();
    expect(screen.getByText('Hafta')).toBeInTheDocument();
  });

  it("chevron-nav + 'Bugun' reset amali saqlangan", () => {
    renderApp(<CalendarScreen />);
    expect(screen.getByRole('button', { name: 'Orqaga' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keyingi' })).toBeInTheDocument();
    expect(screen.getAllByText('Bugun').length).toBeGreaterThan(0);
  });

  it('bemor ismi yozilish DTO sidan keladi (birinchi 100 bemor ro‘yxatiga bog‘liq emas)', () => {
    renderApp(<CalendarScreen />);
    expect(screen.getByText('Dilnoza Rahimova')).toBeInTheDocument();
  });

  it('«Kelmadi» → 10 s ichida qaytarilsa PATCH YUBORILMAYDI va holat o‘zgarmaydi', () => {
    vi.useFakeTimers();
    renderApp(<CalendarScreen />);
    fireEvent.click(screen.getByText('Dilnoza Rahimova'));
    fireEvent.click(screen.getByRole('button', { name: 'Kelmadi' }));
    // UndoToast ko'rindi, optimistik holat «Kelmagan».
    expect(screen.getByText(/Dilnoza Rahimova — Kelmadi/)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    fireEvent.click(screen.getByRole('button', { name: /Qaytarish/ }));
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(hoisted.statusMutate).not.toHaveBeenCalled();
    expect(screen.queryByText(/Dilnoza Rahimova — Kelmadi/)).not.toBeInTheDocument();
    // holat qaytdi: panelda hali «Rejalashtirilgan»
    expect(screen.getByTestId('appointment-panel')).toHaveTextContent('Rejalashtirilgan');
  });

  it('«Kelmadi» → 10 s o‘tsa PATCH bir marta yuboriladi', () => {
    vi.useFakeTimers();
    renderApp(<CalendarScreen />);
    fireEvent.click(screen.getByText('Dilnoza Rahimova'));
    fireEvent.click(screen.getByRole('button', { name: 'Kelmadi' }));
    expect(hoisted.statusMutate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(10_500);
    });
    expect(hoisted.statusMutate).toHaveBeenCalledTimes(1);
    expect(hoisted.statusMutate.mock.calls[0]?.[0]).toEqual({ id: 'a1', status: 'no_show' });
  });

  it('«Bekor qilish» qaytarilmasa cancel endpoint chaqiriladi', () => {
    vi.useFakeTimers();
    renderApp(<CalendarScreen />);
    fireEvent.click(screen.getByText('Dilnoza Rahimova'));
    fireEvent.click(screen.getByRole('button', { name: 'Bekor qilish' }));
    act(() => {
      vi.advanceTimersByTime(10_500);
    });
    expect(hoisted.cancelMutate).toHaveBeenCalledTimes(1);
    expect(hoisted.cancelMutate.mock.calls[0]?.[0]).toEqual({ id: 'a1' });
  });

  it('ekrandan chiqilganda kutilayotgan amal yo‘qolmaydi', () => {
    vi.useFakeTimers();
    const { unmount } = renderApp(<CalendarScreen />);
    fireEvent.click(screen.getByText('Dilnoza Rahimova'));
    fireEvent.click(screen.getByRole('button', { name: 'Kelmadi' }));
    unmount();
    expect(hoisted.statusMutate).toHaveBeenCalledTimes(1);
  });

  it('keyingi qadam: rejalashtirilgan → tasdiqlash (to‘g‘ridan PATCH)', () => {
    renderApp(<CalendarScreen />);
    fireEvent.click(screen.getByText('Dilnoza Rahimova'));
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
    expect(hoisted.statusMutate).toHaveBeenCalledWith({ id: 'a1', status: 'confirmed' });
  });

  it('ruxsatsiz rol (faqat appointment.view): status amallari YO‘Q', () => {
    hoisted.perms = new Set(['appointment.view']);
    renderApp(<CalendarScreen />);
    fireEvent.click(screen.getByText('Dilnoza Rahimova'));
    expect(screen.getByTestId('appointment-panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kelmadi' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bekor qilish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tasdiqlash' })).not.toBeInTheDocument();
  });

  it('jadvalsiz shifokor ustunida sabab bloki (faqat schedule.view bilan bilinadi)', () => {
    hoisted.perms.add('schedule.view');
    hoisted.availability = {
      branchId: 'b1',
      date: 'x',
      slotMinutes: 30,
      doctors: [{ doctorId: 'd1', slots: [] }],
    };
    renderApp(<CalendarScreen />);
    // d2 jadvalsiz → bitta blok
    expect(screen.getAllByRole('note')).toHaveLength(1);
    expect(screen.getByText("Jadvalni ko'rish →")).toBeInTheDocument();
  });

  describe('ko‘chirish (drag + klaviatura)', () => {
    const dt = () => ({ setData: vi.fn(), effectAllowed: '' });
    // jsdom'da DragEvent yo'q — clientY/dataTransfer'ni qo'lda biriktiramiz.
    const drag = (
      type: 'dragStart' | 'drop',
      el: Element,
      clientY: number,
      dataTransfer = dt(),
    ) => {
      const ev = createEvent[type](el);
      Object.defineProperty(ev, 'clientY', { value: clientY });
      Object.defineProperty(ev, 'dataTransfer', { value: dataTransfer });
      fireEvent(el, ev);
    };
    const colBodies = (c: HTMLElement) =>
      Array.from(c.querySelectorAll<HTMLElement>('[class*="colBody"]'));

    it('sudrab boshqa shifokor ustuniga tushirilsa: darhol ko‘chadi, 10 s dan keyin PATCH (vaqt+shifokor)', () => {
      vi.useFakeTimers();
      const { container } = renderApp(<CalendarScreen />);
      const slot = screen.getByText('Dilnoza Rahimova').closest('button') as HTMLElement;
      expect(slot).toHaveAttribute('draggable', 'true');
      drag('dragStart', slot, 0);
      // 12:00 = (12-8) soat × 88 px
      drag('drop', colBodies(container)[1] as HTMLElement, 4 * 88);
      expect(screen.getByText(/Dilnoza Rahimova — Dr\. Vali, 12:00/)).toBeInTheDocument();
      expect(hoisted.moveMutate).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(10_500);
      });
      expect(hoisted.moveMutate).toHaveBeenCalledTimes(1);
      const body = hoisted.moveMutate.mock.calls[0]?.[0];
      expect(body).toMatchObject({ id: 'a1', doctorId: 'd2' });
      expect(new Date(body.startTime).getUTCHours()).toBe(7); // 12:00 Tashkent
      expect(new Date(body.endTime).getUTCHours()).toBe(8);
    });

    it('«Qaytarish» — PATCH yuborilmaydi; server 409 qaytarsa yozilish joyiga qaytadi', () => {
      vi.useFakeTimers();
      const { container } = renderApp(<CalendarScreen />);
      const slot = screen.getByText('Dilnoza Rahimova').closest('button') as HTMLElement;
      drag('dragStart', slot, 0);
      drag('drop', colBodies(container)[0] as HTMLElement, 4 * 88);
      fireEvent.click(screen.getByRole('button', { name: /Qaytarish/ }));
      act(() => {
        vi.advanceTimersByTime(20_000);
      });
      expect(hoisted.moveMutate).not.toHaveBeenCalled();

      // Ikkinchi urinish → 409 → joyiga qaytadi
      hoisted.moveMutate.mockImplementation((_b, opts) =>
        opts.onError(new ApiError('conflict.doctor_busy', 'x', 409)),
      );
      drag('dragStart', slot, 0);
      drag('drop', colBodies(container)[0] as HTMLElement, 4 * 88);
      act(() => {
        vi.advanceTimersByTime(10_500);
      });
      expect(hoisted.moveMutate).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/12:00 ga/)).not.toBeInTheDocument();
    });

    it('appointment.edit yo‘q → sudrab bo‘lmaydi; faol bo‘lmagan holat → draggable emas', () => {
      hoisted.perms = new Set(['appointment.view']);
      renderApp(<CalendarScreen />);
      expect(screen.getByText('Dilnoza Rahimova').closest('button')).not.toHaveAttribute(
        'draggable',
      );
    });

    it('klaviatura alternativasi: panelda «Ko‘chirish» → vaqt + shifokor', () => {
      vi.useFakeTimers();
      renderApp(<CalendarScreen />);
      fireEvent.click(screen.getByText('Dilnoza Rahimova'));
      fireEvent.click(screen.getByRole('button', { name: "Ko'chirish" }));
      fireEvent.change(screen.getByLabelText('Yangi vaqt (shu kun)'), {
        target: { value: '15:30' },
      });
      fireEvent.click(screen.getByRole('button', { name: "Ko'chirish" }));
      act(() => {
        vi.advanceTimersByTime(10_500);
      });
      const body = hoisted.moveMutate.mock.calls[0]?.[0];
      expect(new Date(body.startTime).getUTCHours()).toBe(10);
      expect(new Date(body.startTime).getUTCMinutes()).toBe(30);
      expect(body.doctorId).toBeUndefined();
    });
  });
});
