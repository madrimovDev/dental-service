import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { ServiceCategoriesScreen } from './ServiceCategoriesScreen';

const mockUseServiceCategories = vi.fn();
const mockUseDeleteServiceCategory = vi.fn();
const mockUseUpsertServiceCategory = vi.fn();
const mockHasPermission = vi.fn();

vi.mock('../service-categories.api', () => ({
  useServiceCategories: () => mockUseServiceCategories(),
  useDeleteServiceCategory: () => mockUseDeleteServiceCategory(),
  useUpsertServiceCategory: () => mockUseUpsertServiceCategory(),
}));

vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: mockHasPermission }),
}));

const mockCategory = {
  id: 'c1',
  tenantId: 't1',
  name: 'Terapevtika',
  nameRu: 'Терапия',
  createdAt: '2026-06-27T10:00:00.000Z',
  updatedAt: '2026-06-27T10:00:00.000Z',
};

describe('ServiceCategoriesScreen', () => {
  beforeEach(() => {
    mockUseDeleteServiceCategory.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseUpsertServiceCategory.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockHasPermission.mockReturnValue(true);
  });

  it("loading holatida StateView (aria-busy) ko'rsatiladi", () => {
    mockUseServiceCategories.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });
    renderApp(<ServiceCategoriesScreen />);
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("kategoriya nomi jadvalda ko'rinadi", () => {
    mockUseServiceCategories.mockReturnValue({
      data: [mockCategory],
      isLoading: false,
      isError: false,
    });
    renderApp(<ServiceCategoriesScreen />);
    expect(screen.getByText('Xizmat kategoriyalari')).toBeInTheDocument();
    expect(screen.getByText('Terapevtika')).toBeInTheDocument();
  });

  it("service.manage yo'q bo'lsa create tugmasi ko'rinmaydi", () => {
    mockUseServiceCategories.mockReturnValue({
      data: [mockCategory],
      isLoading: false,
      isError: false,
    });
    mockHasPermission.mockReturnValue(false);
    renderApp(<ServiceCategoriesScreen />);
    expect(screen.queryByText('Yangi kategoriya')).toBeNull();
  });
});
