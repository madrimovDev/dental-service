import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
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
vi.mock('../patients.api', () => ({
  usePatients: () => patientsResult,
  useArchivePatient: () => ({ mutate: archiveMock, isPending: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('PatientsListScreen', () => {
  beforeEach(() => {
    patientsResult = dataResult;
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
    // BalanceBadge: 150000 → "150 000 so'm" (uz-UZ formatlash)
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  it('arxiv tugmasi mutatsiyani id bilan chaqiradi (behavioral)', () => {
    renderApp(<PatientsListScreen />);
    // common.archive uz → "Arxivlash" (IconButton aria-label)
    fireEvent.click(screen.getByLabelText('Arxivlash'));
    expect(archiveMock).toHaveBeenCalledWith('p1');
  });
});
