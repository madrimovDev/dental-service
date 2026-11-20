import { ApiError } from '@dental/api-client';
import { act, createEvent, fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
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
  branches: [] as unknown[],
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
  useBranches: () => ({ data: hoisted.branches }),
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
  window.localStorage.clear();
  hoisted.perms = new Set(['appointment.view', 'appointment.edit', 'appointment.cancel']);
  hoisted.statusMutate.mockReset();
  hoisted.cancelMutate.mockReset();
  hoisted.moveMutate.mockReset();
  hoisted.appts = [appt()];
  hoisted.availability = undefined;
  hoisted.branches = [];
});

afterEach(() => {
  vi.useRealTimers();
});

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
}

describe('CalendarScreen', () => {
  // FT-05.2: grid soatlari filial ish vaqtidan (min open − 1 .. max close + 1) + «soatdan tashqari» belgi.
  const everyDay = (open: string, close: string) =>
    Object.fromEntries(
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, { open, close }]),
    );

  it('grid soatlari filial ish vaqtidan: 10:00–16:00 → 09:00..16:00 belgilari', () => {
    hoisted.branches = [{ id: 'b1', name: 'Asosiy', workHours: everyDay('10:00', '16:00') }];
    renderApp(<CalendarScreen />);
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.getByText('16:00')).toBeInTheDocument();
    expect(screen.queryByText('08:00')).not.toBeInTheDocument();
    expect(screen.queryByText('17:00')).not.toBeInTheDocument();
  });

  it('ish soati sozlanmagan filialda standart 08:00–20:00', () => {
    hoisted.branches = [{ id: 'b1', name: 'Asosiy', workHours: null }];
    renderApp(<CalendarScreen />);
    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.getByText('19:00')).toBeInTheDocument();
    expect(screen.queryByText('20:00')).not.toBeInTheDocument();
  });

  it('ish vaqtidan tashqari yozilish belgilanadi va oyna uni qamraydi', () => {
    hoisted.branches = [{ id: 'b1', name: 'Asosiy', workHours: everyDay('09:00', '18:00') }];
    hoisted.appts = [appt({ startTime: todayAt(21), endTime: todayAt(22) })];
    renderApp(<CalendarScreen />);
    expect(screen.getByText('Soatdan tashqari')).toBeInTheDocument();
    expect(screen.getByText('21:00', { selector: 'div' })).toBeInTheDocument();
  });

  it('ish vaqti ichidagi yozilishda belgi yo‘q', () => {
    hoisted.branches = [{ id: 'b1', name: 'Asosiy', workHours: everyDay('09:00', '18:00') }];
    renderApp(<CalendarScreen />);
    expect(screen.queryByText('Soatdan tashqari')).not.toBeInTheDocument();
  });

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
    const colBodies = (c: HTMLElement) =>
      Array.from(c.querySelectorAll<HTMLElement>('[data-drop-col]'));
    // jsdom'da layout yo'q: ustun tanalarining to'rtburchagini 200px kenglikda qo'lda beramiz.
    const layout = (c: HTMLElement) => {
      colBodies(c).forEach((el, i) => {
        el.getBoundingClientRect = () =>
          ({
            left: i * 200,
            right: i * 200 + 200,
            top: 0,
            bottom: 1056,
            width: 200,
            height: 1056,
          }) as DOMRect;
      });
    };
    // 10:00 = (10-8) soat × 88px = 176
    const slotOf = (c: HTMLElement) => {
      layout(c);
      const slot = screen.getByText('Dilnoza Rahimova').closest('button') as HTMLElement;
      slot.getBoundingClientRect = () => ({ top: 176, left: 0, right: 200 }) as DOMRect;
      return slot;
    };
    // PointerEvent init (clientX/Y, pointerType) jsdom'da yo'qolishi mumkin — qo'lda biriktiramiz.
    const pointer = (
      type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
      el: Element,
      x: number,
      y: number,
      pointerType = 'touch',
    ) => {
      const ev = createEvent[type](el, { bubbles: true });
      Object.defineProperties(ev, {
        clientX: { value: x },
        clientY: { value: y },
        pointerId: { value: 1 },
        pointerType: { value: pointerType },
        button: { value: 0 },
      });
      fireEvent(el, ev);
    };
    const dragTo = (slot: HTMLElement, fromY: number, x: number, y: number, kind = 'touch') => {
      pointer('pointerDown', slot, 50, fromY, kind);
      pointer('pointerMove', slot, x, y, kind);
      pointer('pointerUp', slot, x, y, kind);
    };

    it('pointer drag (touch) boshqa shifokor ustuniga: darhol ko‘chadi, 10 s dan keyin PATCH (vaqt+shifokor)', () => {
      vi.useFakeTimers();
      const { container } = renderApp(<CalendarScreen />);
      const slot = slotOf(container);
      expect(slot).toHaveAttribute('data-draggable', 'true');
      // 12:00 = 4 soat × 88 px; ikkinchi ustun (x 200..400)
      dragTo(slot, 176, 250, 4 * 88);
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

    it('oddiy bosish (harakatsiz) drag emas — detal paneli ochiladi; drag‘dan keyingi click paneli ochmaydi', () => {
      vi.useFakeTimers();
      const { container } = renderApp(<CalendarScreen />);
      const slot = slotOf(container);
      pointer('pointerDown', slot, 50, 180, 'mouse');
      pointer('pointerUp', slot, 50, 180, 'mouse');
      fireEvent.click(slot);
      expect(hoisted.moveMutate).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: "Ko'chirish" })).toBeInTheDocument();

      // drag → brauzer chiqargan click yutiladi (panel yopiq qoladi)
      fireEvent.click(screen.getByRole('button', { name: /Yopish|Close/ }));
      dragTo(slot, 176, 50, 3 * 88, 'mouse');
      fireEvent.click(slot);
      expect(screen.queryByRole('button', { name: "Ko'chirish" })).not.toBeInTheDocument();
    });

    it('pastki chetdan cho‘zish: boshlanish o‘zgarmaydi, tugash 15 daqiqa qadam, UndoToast keyin PATCH', () => {
      vi.useFakeTimers();
      const { container } = renderApp(<CalendarScreen />);
      const slot = slotOf(container);
      const handle = slot.querySelector('[data-resize-handle]') as HTMLElement;
      expect(handle).not.toBeNull();
      // 11:00 gacha edi; 11:40 → 11:45 ga yaxlitlanadi: (11:40-08:00)=220min*88/60
      const y = (220 * 88) / 60;
      pointer('pointerDown', handle, 50, 176 + 88);
      pointer('pointerMove', handle, 50, y);
      pointer('pointerUp', handle, 50, y);
      expect(screen.getByText(/Dilnoza Rahimova — tugash 11:45/)).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(10_500);
      });
      expect(hoisted.moveMutate).toHaveBeenCalledTimes(1);
      const body = hoisted.moveMutate.mock.calls[0]?.[0];
      expect(body.id).toBe('a1');
      expect(body.doctorId).toBeUndefined();
      expect(new Date(body.startTime).toISOString()).toBe(
        hoisted.appts[0] && (hoisted.appts[0] as { startTime: string }).startTime,
      );
      expect(new Date(body.endTime).getUTCHours()).toBe(6); // 11:45 Tashkent = 06:45Z
      expect(new Date(body.endTime).getUTCMinutes()).toBe(45);
    });

    it('«Qaytarish» — PATCH yuborilmaydi; server 409 qaytarsa yozilish joyiga qaytadi', () => {
      vi.useFakeTimers();
      const { container } = renderApp(<CalendarScreen />);
      const slot = slotOf(container);
      dragTo(slot, 176, 50, 4 * 88);
      fireEvent.click(screen.getByRole('button', { name: /Qaytarish/ }));
      act(() => {
        vi.advanceTimersByTime(20_000);
      });
      expect(hoisted.moveMutate).not.toHaveBeenCalled();

      // Ikkinchi urinish → 409 → joyiga qaytadi
      hoisted.moveMutate.mockImplementation((_b, opts) =>
        opts.onError(new ApiError('conflict.doctor_busy', 'x', 409)),
      );
      dragTo(slot, 176, 50, 4 * 88);
      act(() => {
        vi.advanceTimersByTime(10_500);
      });
      expect(hoisted.moveMutate).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/12:00 ga/)).not.toBeInTheDocument();
    });

    it('appointment.edit yo‘q → sudrab bo‘lmaydi (handle ham yo‘q); faol bo‘lmagan holat → draggable emas', () => {
      hoisted.perms = new Set(['appointment.view']);
      const { container } = renderApp(<CalendarScreen />);
      const slot = screen.getByText('Dilnoza Rahimova').closest('button') as HTMLElement;
      expect(slot).not.toHaveAttribute('data-draggable');
      expect(slot.querySelector('[data-resize-handle]')).toBeNull();
      layout(container);
      dragTo(slot, 176, 250, 4 * 88);
      expect(hoisted.moveMutate).not.toHaveBeenCalled();
    });

    it('hafta ko‘rinishida drag: boshqa kunga ko‘chadi (shifokor o‘zgarmaydi), PATCH sana+vaqt', () => {
      vi.useFakeTimers();
      const { container } = renderApp(<CalendarScreen />);
      fireEvent.click(screen.getByRole('tab', { name: /Hafta/ }));
      layout(container);
      const slot = screen.getByText('Dilnoza Rahimova').closest('button') as HTMLElement;
      slot.getBoundingClientRect = () => ({ top: 176, left: 0, right: 200 }) as DOMRect;
      const bodies = colBodies(container);
      expect(bodies).toHaveLength(7);
      // 4-ustun (x 600..800) = dushanbadan 3 kun keyin; 09:30
      const targetKey = bodies[3]?.dataset.dropCol as string;
      dragTo(slot, 176, 650, 1.5 * 88);
      act(() => {
        vi.advanceTimersByTime(10_500);
      });
      expect(hoisted.moveMutate).toHaveBeenCalledTimes(1);
      const body = hoisted.moveMutate.mock.calls[0]?.[0];
      expect(body.doctorId).toBeUndefined();
      expect(body.startTime).toBe(new Date(`${targetKey}T09:30:00+05:00`).toISOString());
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

  // FT-05.1: bo'sh katak → /appointments/new (doktor, sana, vaqt, filial oldindan to'ldirilgan).
  it("bo'sh katak bosilsa yangi yozilishga doktor/sana/vaqt bilan o'tadi (appointment.create)", () => {
    hoisted.perms.add('appointment.create');
    renderApp(
      <>
        <CalendarScreen />
        <LocationProbe />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Dr\. Vali.*11:30/ }));
    const loc = screen.getByTestId('loc').textContent ?? '';
    const url = new URL(loc, 'http://x');
    expect(url.pathname).toBe('/appointments/new');
    expect(url.searchParams.get('doctorId')).toBe('d2');
    expect(url.searchParams.get('time')).toBe('11:30');
    expect(url.searchParams.get('branchId')).toBe('b1');
    expect(url.searchParams.get('date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("appointment.create yo'q — katak tugmalari chiqmaydi", () => {
    renderApp(<CalendarScreen />);
    expect(screen.queryByRole('button', { name: /11:30/ })).not.toBeInTheDocument();
  });

  it("«Bo'sh vaqtlar» slot chip bosilsa yangi yozilishga o'tadi", () => {
    hoisted.perms.add('appointment.create');
    hoisted.perms.add('schedule.view');
    hoisted.availability = {
      branchId: 'b1',
      date: 'x',
      slotMinutes: 30,
      doctors: [
        {
          doctorId: 'd1',
          slots: [{ start: '2026-06-27T04:30:00.000Z', end: '', startMinute: 570, endMinute: 600 }],
        },
      ],
    };
    renderApp(
      <>
        <CalendarScreen />
        <LocationProbe />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: '09:30' }));
    const url = new URL(screen.getByTestId('loc').textContent ?? '', 'http://x');
    expect(url.pathname).toBe('/appointments/new');
    expect(url.searchParams.get('doctorId')).toBe('d1');
    expect(url.searchParams.get('time')).toBe('09:30');
  });

  // FT-05.4: zoom 3 daraja (localStorage) + planshet (<1024px) rail drawer'ga.
  it('zoom: 3 daraja slot balandligini o‘zgartiradi va localStorage’da saqlanadi', () => {
    const { unmount } = renderApp(<CalendarScreen />);
    const hourPx = () =>
      Number.parseFloat(
        (document.querySelector('[data-cal-grid]') as HTMLElement).style.getPropertyValue(
          '--cal-hour',
        ),
      );
    const normal = hourPx();
    expect(normal).toBeCloseTo(88, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Katta' }));
    expect(hourPx()).toBeGreaterThan(normal);
    expect(window.localStorage.getItem('calendar.zoom')).toBe('comfortable');
    // slot balandligi ham mos o'zgardi (1 soat × zichlik)
    const slot = screen.getByText('Dilnoza Rahimova').closest('button') as HTMLElement;
    expect(Number.parseFloat(slot.style.height)).toBeCloseTo(hourPx(), 0);
    unmount();
    // qayta ochilganda saqlangan daraja
    renderApp(<CalendarScreen />);
    expect(hourPx()).toBeGreaterThan(normal);
    fireEvent.click(screen.getByRole('button', { name: 'Kichik' }));
    expect(hourPx()).toBeLessThan(normal);
    expect(window.localStorage.getItem('calendar.zoom')).toBe('compact');
  });

  describe('planshet (<1024px)', () => {
    const origMatchMedia = window.matchMedia;
    afterEach(() => {
      window.matchMedia = origMatchMedia;
    });
    const setTablet = (tablet: boolean) => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: tablet && query.includes('max-width: 1023'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia;
    };

    it('keng ekranda o‘ng panel yonida (drawer tugmasi yo‘q)', () => {
      setTablet(false);
      renderApp(<CalendarScreen />);
      expect(screen.getByTestId('calendar-rail')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Panel' })).not.toBeInTheDocument();
    });

    it('planshetda panel drawer’ga ko‘chadi: tugma bilan ochiladi', async () => {
      setTablet(true);
      renderApp(<CalendarScreen />);
      expect(screen.queryByTestId('calendar-rail')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Panel' }));
      const rail = await screen.findByTestId('calendar-rail');
      expect(screen.getByRole('dialog')).toContainElement(rail);
    });

    it('planshetda yozilish bosilsa tafsilot drawer’da ochiladi', async () => {
      setTablet(true);
      renderApp(<CalendarScreen />);
      fireEvent.click(screen.getByText('Dilnoza Rahimova'));
      const panel = await screen.findByTestId('appointment-panel');
      expect(screen.getByRole('dialog')).toContainElement(panel);
    });
  });
});
