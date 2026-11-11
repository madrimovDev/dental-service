import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { BalanceChip } from './BalanceChip';
import { PatientsListScreen } from './PatientsListScreen';

const archiveMock = vi.fn();
const dataResult = {
  data: {
    items: [
      {
        id: 'p1',
        fullName: 'Ali Valiyev',
        phone: '+998901234567',
        age: 36,
        genderLabel: 'Erkak',
        tags: ['VIP'],
        balance: 150000,
        flagged: false,
        noShowStrikes: 2,
        nextAppointmentAt: null as string | null,
        flags: { allergy: true, debt: true, noShows: 2, telegram: true },
      },
    ],
    meta: { page: 1, pageSize: 20, total: 1 },
  },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};
// biome-ignore lint/suspicious/noExplicitAny: test-only mutable mock result
let patientsResult: any = dataResult;
// Captures the params usePatients was called with (behavioral assertions).
const usePatientsMock = vi.fn((_params?: unknown) => patientsResult);
vi.mock('../patients.api', () => ({
  usePatients: (params: unknown) => usePatientsMock(params),
  useArchivePatient: () => ({ mutate: archiveMock, isPending: false }),
  useImportPatients: () => ({ mutateAsync: vi.fn(), isPending: false, reset: vi.fn() }),
}));
let allowedPerms: ((code: string) => boolean) | undefined;
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: (code: string) => allowedPerms?.(code) ?? true }),
}));

describe('PatientsListScreen', () => {
  beforeEach(() => {
    patientsResult = dataResult;
    allowedPerms = undefined;
    usePatientsMock.mockClear();
    archiveMock.mockClear();
  });

  it('loading holatida skeleton (aria-busy) render qiladi', () => {
    patientsResult = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    renderApp(<PatientsListScreen />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("bemorni ro'yxatda ko'rsatadi", () => {
    renderApp(<PatientsListScreen />);
    expect(screen.getByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText('VIP')).toBeInTheDocument();
  });

  it("bemor balansini ro'yxatda ko'rsatadi", () => {
    renderApp(<PatientsListScreen />);
    // BalanceChip: 150000 (debt) → formatCurrency → "150 000 so'm"
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  it('arxiv tugmasi mutatsiyani id bilan chaqiradi (behavioral)', () => {
    renderApp(<PatientsListScreen />);
    // common.archive uz → "Arxivlash" (IconButton aria-label)
    fireEvent.click(screen.getByLabelText('Arxivlash'));
    expect(archiveMock).toHaveBeenCalledWith('p1');
  });

  it("'Arxiv' pill usePatients ni archived:true bilan chaqiradi (behavioral)", () => {
    renderApp(<PatientsListScreen />);
    // Initial render: archived false.
    expect(usePatientsMock).toHaveBeenCalledWith(expect.objectContaining({ archived: false }));
    usePatientsMock.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Arxiv' }));
    expect(usePatientsMock).toHaveBeenCalledWith(expect.objectContaining({ archived: true }));
  });

  it("arxivlangan filtrda 'Arxivlash' tugmasi ko'rinmaydi (L11 bug fix)", () => {
    renderApp(<PatientsListScreen />);
    // Boshida (archived=false) tugma ko'rinadi.
    expect(screen.getByLabelText('Arxivlash')).toBeInTheDocument();
    // "Arxiv" filtr pill'ini bosamiz.
    fireEvent.click(screen.getByRole('button', { name: 'Arxiv' }));
    // Arxivlangan ro'yxatda qayta-arxivlash ma'nosiz (backend unarchive yo'q) — tugma yo'q.
    expect(screen.queryByLabelText('Arxivlash')).not.toBeInTheDocument();
  });

  it("bo'sh ro'yxatda empty-state CTA tugmasi ko'rinadi", () => {
    patientsResult = {
      data: { items: [], meta: { page: 1, pageSize: 20, total: 0 } },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderApp(<PatientsListScreen />);
    const emptyState = document.querySelector('[data-state="empty"]') as HTMLElement;
    expect(emptyState).not.toBeNull();
    // CTA is scoped inside the StateView (avoids the duplicate header button trap).
    expect(within(emptyState).getByRole('button')).toBeInTheDocument();
  });
});

describe('PatientsListScreen — UI-R6', () => {
  beforeEach(() => {
    patientsResult = dataResult;
    allowedPerms = undefined;
    usePatientsMock.mockClear();
  });

  it('belgilar MATN bilan ko‘rinadi: allergiya, qarz, kelmagan, Telegram', () => {
    renderApp(<PatientsListScreen />);
    expect(screen.getByText('Allergiya')).toBeInTheDocument();
    expect(screen.getByText('Qarz')).toBeInTheDocument();
    expect(screen.getByText('Kelmagan: 2')).toBeInTheDocument();
    expect(screen.getByText('Telegram')).toBeInTheDocument();
  });

  it('belgisiz bemorda belgilar qatori chiqmaydi', () => {
    patientsResult = {
      ...dataResult,
      data: {
        ...dataResult.data,
        items: [
          {
            ...dataResult.data.items[0],
            balance: 0,
            flags: { allergy: false, debt: false, noShows: 0, telegram: false },
          },
        ],
      },
    };
    renderApp(<PatientsListScreen />);
    expect(screen.queryByText('Allergiya')).not.toBeInTheDocument();
    expect(screen.queryByText('Qarz')).not.toBeInTheDocument();
  });

  it('kirill qidiruvda lotin varianti izohi ko‘rinadi', () => {
    renderApp(<PatientsListScreen />);
    fireEvent.change(screen.getByPlaceholderText(/qidirish/i), { target: { value: 'турсун' } });
    expect(screen.getByText('«tursun» ham topiladi')).toBeInTheDocument();
  });

  it('PT-03: view_pii yo‘q bo‘lsa qidiruv placeholder faqat ism haqida', () => {
    allowedPerms = (code) => code !== 'patient.view_pii';
    renderApp(<PatientsListScreen />);
    expect(screen.getByPlaceholderText("Ism bo'yicha qidirish...")).toBeInTheDocument();
  });

  it('qidiruv URL search param ga yoziladi (navigatsiyadan keyin saqlanadi)', () => {
    renderApp(<PatientsListScreen />, { route: '/patients?q=ali&archived=1' });
    expect(usePatientsMock).toHaveBeenCalledWith(
      expect.objectContaining({ archived: true, page: 1 }),
    );
    expect((screen.getByPlaceholderText(/qidirish/i) as HTMLInputElement).value).toBe('ali');
  });

  it('«Yozish» tugmasi appointment.create ruxsati bilan ko‘rinadi', () => {
    renderApp(<PatientsListScreen />);
    expect(screen.getByRole('button', { name: 'Yozish' })).toBeInTheDocument();
  });

  it('appointment.create yo‘q bo‘lsa «Yozish» ko‘rinmaydi', () => {
    allowedPerms = (code) => code !== 'appointment.create';
    renderApp(<PatientsListScreen />);
    expect(screen.queryByRole('button', { name: 'Yozish' })).not.toBeInTheDocument();
  });
});

describe('PatientsListScreen — FU-24', () => {
  beforeEach(() => {
    patientsResult = dataResult;
    allowedPerms = undefined;
    usePatientsMock.mockClear();
  });

  it('«Qarzdorlar» chip usePatients ni debt:true bilan chaqiradi va qayta bosilsa o‘chiradi', () => {
    renderApp(<PatientsListScreen />);
    expect(usePatientsMock).toHaveBeenCalledWith(expect.objectContaining({ debt: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Qarzdorlar' }));
    expect(usePatientsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ debt: true, archived: false }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Qarzdorlar' }));
    expect(usePatientsMock).toHaveBeenLastCalledWith(expect.objectContaining({ debt: false }));
  });

  it("debt filtri URL'dan o‘qiladi", () => {
    renderApp(<PatientsListScreen />, { route: '/patients?debt=1' });
    expect(usePatientsMock).toHaveBeenCalledWith(expect.objectContaining({ debt: true }));
  });

  it('«Keyingi tashrif» ustuni appointment.view bilan; sana bor bo‘lsa ko‘rsatiladi', () => {
    patientsResult = {
      ...dataResult,
      data: {
        ...dataResult.data,
        items: [{ ...dataResult.data.items[0], nextAppointmentAt: '2026-11-20T09:30:00.000Z' }],
      },
    };
    renderApp(<PatientsListScreen />);
    expect(screen.getByText('Keyingi tashrif')).toBeInTheDocument();
    expect(screen.getByText(/noy/i)).toBeInTheDocument();
  });

  it('appointment.view yo‘q bo‘lsa «Keyingi tashrif» ustuni yo‘q', () => {
    allowedPerms = (code) => code !== 'appointment.view';
    renderApp(<PatientsListScreen />);
    expect(screen.queryByText('Keyingi tashrif')).not.toBeInTheDocument();
  });

  it("«Excel'dan import» faqat patient.import bilan ko‘rinadi", () => {
    renderApp(<PatientsListScreen />);
    expect(screen.getByRole('button', { name: /Excel/ })).toBeInTheDocument();
  });

  it('patient.import yo‘q (Receptionist) → import tugmasi yo‘q', () => {
    allowedPerms = (code) => code !== 'patient.import';
    renderApp(<PatientsListScreen />);
    expect(screen.queryByRole('button', { name: /Excel/ })).not.toBeInTheDocument();
  });
});

describe('BalanceChip', () => {
  it("balance === 0 → 'paid' tone", () => {
    const { container } = renderApp(<BalanceChip balance={0} />);
    expect(container.querySelector('[data-tone="paid"]')).not.toBeNull();
  });

  it("balance > 0 → 'debt' tone + formatlangan summa", () => {
    const { container } = renderApp(<BalanceChip balance={150000} />);
    expect(container.querySelector('[data-tone="debt"]')).not.toBeNull();
    expect(container.textContent).toMatch(/150/);
  });

  it("balance < 0 → 'credit' tone + manfiy belgi", () => {
    const { container } = renderApp(<BalanceChip balance={-50000} />);
    expect(container.querySelector('[data-tone="credit"]')).not.toBeNull();
    expect(container.textContent).toMatch(/−/);
    expect(container.textContent).toMatch(/50/);
  });
});
