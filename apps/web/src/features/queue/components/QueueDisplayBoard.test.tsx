import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { queueRoutes } from '../queue.routes';
import { QueueDisplayBoard } from './QueueDisplayBoard';

// Hoisted navigate spy so the same instance is observed across renders.
const { navigateSpy } = vi.hoisted(() => ({ navigateSpy: vi.fn() }));

// Mutable queue dataset — per-test injectable (mirrors QueueBoard.test pattern).
let queueData: Array<Record<string, unknown>> = [];

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

vi.mock('../queue.api', () => ({
  useBranches: () => ({ data: [{ id: 'b1', name: 'Asosiy' }] }),
  usePatientsAll: () => ({
    data: {
      data: [
        { id: 'p1', fullName: 'Ali Valiyev' },
        { id: 'p2', fullName: 'Vali Aliyev' },
        { id: 'p3', fullName: 'Hasan Hasanov' },
        { id: 'p4', fullName: 'Dilshod Karimov' },
        { id: 'p5', fullName: 'Madina Yusupova' },
      ],
    },
  }),
  useServices: () => ({ data: [{ id: 's1', nameUz: 'Tozalash' }] }),
  useQueueToday: () => ({ data: queueData, isLoading: false, isError: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ activeBranchId: 'b1' }),
}));

function ticket(over: Record<string, unknown>) {
  return {
    id: 't1',
    tenantId: 'tn1',
    branchId: 'b1',
    patientId: 'p1',
    serviceId: 's1',
    doctorId: null,
    appointmentId: null,
    queueNumber: 1,
    ticketDate: '2026-06-22',
    status: 'waiting',
    calledAt: null,
    finishedAt: null,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

describe('QueueDisplayBoard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    queueData = [];
    navigateSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("route guard perm queue.view bilan /queue/board ni ro'yxatdan o'tkazadi", () => {
    const route = queueRoutes.find((r) => r.path === '/queue/board');
    expect(route).toBeDefined();
    expect(route?.perm).toBe('queue.view');
  });

  it("barcha in_progress ticketlarni cheklovsiz va 'Kabinet N' yorlig'isiz ko'rsatadi (FX-125)", () => {
    queueData = [
      ticket({ id: 'ip1', status: 'in_progress', queueNumber: 6, patientId: 'p1' }),
      ticket({ id: 'ip2', status: 'in_progress', queueNumber: 7, patientId: 'p2' }),
      ticket({ id: 'ip3', status: 'in_progress', queueNumber: 8, patientId: 'p3' }),
    ];
    const { container } = renderApp(<QueueDisplayBoard />);
    const calledNumbers = container.querySelectorAll('[class*="cabinetNumber"]');
    expect([...calledNumbers].map((n) => n.textContent)).toEqual(['A-06', 'A-07', 'A-08']);
    // Slot-indeksga bog'liq «Kabinet 1/2» yorlig'i yo'q.
    expect(screen.queryByText(/Kabinet/i)).toBeNull();
    // PII: TV ekranida bemor ismi YO'Q (faqat raqam).
    expect(screen.queryByText('Ali Valiyev')).toBeNull();
    expect(screen.queryByText('Vali Aliyev')).toBeNull();
  });

  it("raqam o'rni slotga bog'liq emas: birinchi chaqirilgan tugagach qolganlar sakramaydi", () => {
    queueData = [
      ticket({ id: 'ip2', status: 'in_progress', queueNumber: 7, patientId: 'p2' }),
      ticket({ id: 'ip3', status: 'in_progress', queueNumber: 8, patientId: 'p3' }),
    ];
    const { container } = renderApp(<QueueDisplayBoard />);
    const calledNumbers = container.querySelectorAll('[class*="cabinetNumber"]');
    expect([...calledNumbers].map((n) => n.textContent)).toEqual(['A-07', 'A-08']);
  });

  it("hech kim chaqirilmagan bo'lsa bitta placeholder ko'rsatadi", () => {
    queueData = [];
    const { container } = renderApp(<QueueDisplayBoard />);
    const calledNumbers = container.querySelectorAll('[class*="cabinetNumber"]');
    expect([...calledNumbers].map((n) => n.textContent)).toEqual(['—']);
  });

  it('birinchi 3 waiting ticketdan "keyingi navbatlar" kartalarini chiqaradi', () => {
    queueData = [
      ticket({ id: 'w1', status: 'waiting', queueNumber: 10, patientId: 'p1' }),
      ticket({ id: 'w2', status: 'waiting', queueNumber: 11, patientId: 'p2' }),
      ticket({ id: 'w3', status: 'waiting', queueNumber: 12, patientId: 'p3' }),
      ticket({ id: 'w4', status: 'waiting', queueNumber: 13, patientId: 'p4' }),
    ];
    const { container } = renderApp(<QueueDisplayBoard />);
    const nextNumbers = container.querySelectorAll('[class*="nextNumber"]');
    expect(nextNumbers).toHaveLength(3);
    expect(nextNumbers[0]?.textContent).toBe('A-10');
    expect(nextNumbers[1]?.textContent).toBe('A-11');
    expect(nextNumbers[2]?.textContent).toBe('A-12');
  });

  it('"Chiqish" tugmasi /queue ga navigatsiya qiladi', () => {
    renderApp(<QueueDisplayBoard />);
    const exitBtn = screen.getByRole('button', { name: /Chiqish/ });
    fireEvent.click(exitBtn);
    expect(navigateSpy).toHaveBeenCalledWith('/queue');
  });

  it('jonli soatni render qiladi', () => {
    const { container } = renderApp(<QueueDisplayBoard />);
    const clock = container.querySelector('[class*="clock"]');
    expect(clock).not.toBeNull();
    expect(clock?.textContent ?? '').toMatch(/\d{1,2}:\d{2}/);
  });
});
