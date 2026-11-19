import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import { StockScreen } from './StockScreen';

let perms: string[] = [];
vi.mock('@/stores/auth-store.ts', () => ({
  useAuthStore: () => ({ hasPermission: (p: string) => perms.includes(p) }),
}));

const listStockItems = vi.fn();
const listStockBom = vi.fn();
const listServices = vi.fn();

vi.mock('@dental/api-client', async (orig) => ({
  ...(await orig<typeof import('@dental/api-client')>()),
  listStockItems: (...a: unknown[]) => listStockItems(...a),
  listStockBom: (...a: unknown[]) => listStockBom(...a),
  listServices: (...a: unknown[]) => listServices(...a),
  listBranches: () => Promise.resolve({ data: [{ id: 'b1', name: 'Filial 1' }] }),
  listExpiringStockBatches: () => Promise.resolve({ data: [] }),
  listStockAutoDeductionsToday: () => Promise.resolve({ data: [] }),
  listStockMovements: () => Promise.resolve({ data: [] }),
}));

const stockItem = (id: string, name: string, branchId: string | null) => ({
  id,
  tenantId: 't',
  branchId,
  name,
  unit: 'dona',
  category: null,
  price: null,
  quantity: '10',
  minThreshold: '1',
  createdAt: '',
  updatedAt: '',
  lowStock: false,
  avgDailyUsage: '0',
  daysLeft: null,
});

const service = {
  id: 's1',
  tenantId: 't',
  code: 'S1',
  nameUz: 'Plomba',
  nameRu: null,
  isActive: true,
};

beforeEach(() => {
  perms = ['stock.view', 'stock.manage', 'service.view'];
  listStockItems.mockReset();
  listStockBom.mockReset();
  listServices.mockReset();
  // Filial b1 faqat A materialini qaytaradi; filtrsiz — A va B (B boshqa/umumiy filialda).
  listStockItems.mockImplementation((params?: { branchId?: string }) =>
    Promise.resolve({
      data: params?.branchId
        ? [stockItem('ia', 'Material A', 'b1')]
        : [stockItem('ia', 'Material A', 'b1'), stockItem('ib', 'Material B', null)],
    }),
  );
  listStockBom.mockResolvedValue({
    data: [
      { id: 'm1', tenantId: 't', serviceId: 's1', itemId: 'ib', qtyPerService: '2', createdAt: '' },
    ],
  });
  listServices.mockResolvedValue({ data: [service] });
});

async function openBomTab() {
  fireEvent.click(await screen.findByRole('tab', { name: /Sarflanish/ }));
}

describe('StockScreen BOM tabi (FX-163)', () => {
  it('filial filtri tanlangan bo‘lsa ham BOM materiali UUID emas, nom bilan chiqadi', async () => {
    renderApp(<StockScreen />);
    // Filial filtrini tanlaymiz — items ro'yxati toraydi.
    fireEvent.click(await screen.findByRole('textbox', { name: /Barcha filial/ }));
    fireEvent.click(await screen.findByText('Filial 1'));
    await waitFor(() =>
      expect(listStockItems.mock.calls.some((c) => c[0]?.branchId === 'b1')).toBe(true),
    );
    await openBomTab();
    fireEvent.click(await screen.findByRole('textbox', { name: 'Xizmat' }));
    fireEvent.click(await screen.findByText('Plomba'));
    expect(await screen.findByText('Material B')).toBeTruthy();
    expect(screen.queryByText('ib')).toBeNull();
  });
});

describe('StockScreen BOM tabi (FX-164)', () => {
  it('service.view yo‘q (Nurse): bo‘sh jadval o‘rniga ruxsat tushuntirishi', async () => {
    perms = ['stock.view', 'stock.manage'];
    renderApp(<StockScreen />);
    await openBomTab();
    expect(await screen.findByText(/Xizmatlar ro'yxatini ko'rish uchun ruxsat/)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Xizmat' })).toBeNull();
  });
});
