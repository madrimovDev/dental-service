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
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('PatientsListScreen', () => {
  beforeEach(() => {
    patientsResult = dataResult;
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
    // The second filter pill is "Arxiv".
    const pills = screen.getAllByRole('button').filter((b) => b.dataset.active != null);
    const archivedPill = pills[1];
    if (!archivedPill) throw new Error('archived filter pill not found');
    fireEvent.click(archivedPill);
    expect(usePatientsMock).toHaveBeenCalledWith(expect.objectContaining({ archived: true }));
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
