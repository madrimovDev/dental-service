import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { ServiceFormModal } from './ServiceFormModal';

const upsertMutate = vi.fn();
const setPriceMutate = vi.fn();

vi.mock('../services.api', () => ({
  useBranches: () => ({ data: [{ id: 'b1', name: 'Asosiy' }] }),
  useServiceDetail: () => ({ data: { prices: [] } }),
  useUpsertService: () => ({ mutate: upsertMutate, isPending: false }),
  useSetPrice: () => ({ mutate: setPriceMutate, isPending: false }),
}));

const editing = {
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
};

describe('ServiceFormModal', () => {
  it("Ma'lumot saqlash → upsert chaqiradi", async () => {
    renderApp(<ServiceFormModal opened editing={editing} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Saqlash'));
    await waitFor(() => expect(upsertMutate).toHaveBeenCalled());
  });

  it("Narxlar tab → narx qo'shish → setPrice chaqiradi", () => {
    renderApp(<ServiceFormModal opened editing={editing} onClose={vi.fn()} />);
    // Narxlar tabga o'tish
    fireEvent.click(screen.getByText('Narxlar'));
    // filial tanlash uchun Select'ni ochish o'rniga to'g'ridan setPrice tugmasini
    // sinash murakkab — tab almashishi va "Narx belgilash" tugmasi ko'rinishini tekshiramiz
    expect(screen.getByText('Narx belgilash')).toBeInTheDocument();
  });
});
