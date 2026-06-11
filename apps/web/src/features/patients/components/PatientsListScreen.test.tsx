import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { PatientsListScreen } from './PatientsListScreen';

const archiveMock = vi.fn();
vi.mock('../patients.api', () => ({
  usePatients: () => ({
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
  }),
  useArchivePatient: () => ({ mutate: archiveMock, isPending: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('PatientsListScreen', () => {
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
