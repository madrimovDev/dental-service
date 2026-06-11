import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { ServicesScreen } from './ServicesScreen';

vi.mock('../services.api', () => ({
  useServices: () => ({
    data: [
      {
        id: 's1',
        tenantId: 't',
        code: 'PL-001',
        nameUz: 'Plomba',
        nameRu: null,
        category: 'Terapevtika',
        durationMinutes: 30,
        requiredRole: null,
        descriptionUz: null,
        descriptionRu: null,
        isActive: true,
        createdAt: '2026-06-11T00:00:00Z',
        updatedAt: '2026-06-11T00:00:00Z',
        deletedAt: null,
      },
    ],
  }),
  useDeleteService: () => ({ mutate: vi.fn(), isPending: false }),
  // ServiceFormModal ichidagi hooklar (modal yopiq bo'lsa ham mount bo'ladi)
  useBranches: () => ({ data: [] }),
  useServiceDetail: () => ({ data: { prices: [] } }),
  useUpsertService: () => ({ mutate: vi.fn(), isPending: false }),
  useSetPrice: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: () => true }),
}));

describe('ServicesScreen', () => {
  it('katalog sarlavhasi + qidiruv + guruhlangan xizmat', () => {
    renderApp(<ServicesScreen />);
    expect(screen.getByText('Xizmatlar katalogi')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/qidir/i)).toBeInTheDocument();
    expect(screen.getByText('Terapevtika')).toBeInTheDocument();
    expect(screen.getByText('Plomba')).toBeInTheDocument();
  });
});
