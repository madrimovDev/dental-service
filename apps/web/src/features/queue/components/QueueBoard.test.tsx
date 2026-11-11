import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { QueueBoard } from './QueueBoard';

// Hoisted spies so assertions observe the same instance across renders.
const { updateMutate, callOwnMutate, navigateSpy } = vi.hoisted(() => ({
  updateMutate: vi.fn(),
  callOwnMutate: vi.fn(),
  navigateSpy: vi.fn(),
}));

// Mutable queue dataset — per-test injectable.
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
      ],
    },
  }),
  useServices: () => ({ data: [{ id: 's1', nameUz: 'Tozalash' }] }),
  useQueueToday: () => ({ data: queueData, isLoading: false, isError: false }),
  useCheckInCandidates: () => ({ data: [] }),
  useCreateTicket: () => ({ mutate: vi.fn(), isPending: false }),
  useCallOwnTicket: () => ({ mutate: callOwnMutate, isPending: false, variables: undefined }),
  useUpdateQueueStatus: () => ({ mutate: updateMutate, isPending: false, variables: undefined }),
}));
let perms: string[] | 'all' = 'all';
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({
    hasPermission: (p: string) => perms === 'all' || perms.includes(p),
    activeBranchId: 'b1',
  }),
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

describe('QueueBoard', () => {
  beforeEach(() => {
    queueData = [];
    perms = 'all';
    updateMutate.mockClear();
    callOwnMutate.mockClear();
    navigateSpy.mockClear();
  });

  it("3 ustun sarlavhasini ko'rsatadi", () => {
    renderApp(<QueueBoard />);
    expect(screen.getByText(/Kutmoqda/)).toBeInTheDocument();
    expect(screen.getByText(/Qabulda/)).toBeInTheDocument();
    expect(screen.getByText(/Kassaga yuborildi/)).toBeInTheDocument();
  });

  it("'TV ekranini ochish' tugmasi /queue/board ga navigatsiya qiladi", () => {
    renderApp(<QueueBoard />);
    const btn = screen.getByRole('button', { name: /TV ekranini ochish/ });
    fireEvent.click(btn);
    expect(navigateSpy).toHaveBeenCalledWith('/queue/board');
  });

  it("now-serving hero in_progress ticket uchun A-NN raqamini ko'rsatadi", () => {
    queueData = [ticket({ id: 'tip', status: 'in_progress', queueNumber: 6, patientId: 'p1' })];
    const { container } = renderApp(<QueueBoard />);
    // Hero now-serving raqami (A-NN formatter) — kartada ham ko'rinishi mumkin,
    // shu sababli hero blokining o'zida tekshiramiz.
    const hero = container.querySelector('[class*="hero"]');
    expect(hero).not.toBeNull();
    const heroNumber = container.querySelector('[class*="heroNumber"]');
    expect(heroNumber?.textContent).toBe('A-06');
    // Bemor ismi hero blokida ko'rinadi.
    expect(hero?.textContent).toContain('Ali Valiyev');
  });

  it("'Chaqirish →' tugmasi head-waiting ticketni in_progress ga o'tkazadi", () => {
    queueData = [ticket({ id: 'tw', status: 'waiting', queueNumber: 3, patientId: 'p2' })];
    renderApp(<QueueBoard />);
    const callBtn = screen.getByRole('button', { name: /Chaqirish →/ });
    fireEvent.click(callBtn);
    expect(updateMutate).toHaveBeenCalledWith({ id: 'tw', status: 'in_progress' });
  });

  it("queue.manage'siz shifokor chaqirsa call-own ishlatiladi (PATCH status emas)", () => {
    perms = ['queue.view'];
    queueData = [ticket({ id: 'tw', status: 'waiting', queueNumber: 3, patientId: 'p2' })];
    renderApp(<QueueBoard />);
    fireEvent.click(screen.getByRole('button', { name: /Chaqirish →/ }));
    expect(callOwnMutate).toHaveBeenCalledWith('tw');
    expect(updateMutate).not.toHaveBeenCalled();
  });
});
