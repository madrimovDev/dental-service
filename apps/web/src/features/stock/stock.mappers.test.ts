import type { ServiceMaterial, StockMovement } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import {
  daysStateOf,
  formatQty,
  servicesByItem,
  sortCriticalFirst,
  stockStateOf,
  toExpiringBatchVMs,
  toServiceMaterialVM,
  toStockItemVM,
  toStockMovementVM,
} from './stock.mappers';
import type { StockItemDto } from './stock.types';

function item(over: Partial<StockItemDto> = {}): StockItemDto {
  return {
    id: 'i1',
    tenantId: 't',
    branchId: 'b1',
    name: 'Anesteziya',
    unit: 'ml',
    category: null,
    price: null,
    quantity: '12.50',
    minThreshold: '5',
    lowStock: false,
    createdAt: '2026-06-11T00:00:00Z',
    updatedAt: '2026-06-11T00:00:00Z',
    ...over,
  };
}

describe('stock.mappers', () => {
  describe('formatQty', () => {
    it('minglik ajratadi, valyuta qoʻshmaydi (miqdor, pul emas)', () => {
      const out = formatQty(1200);
      expect(out).not.toContain("so'm");
      expect(out.replace(/\s| /g, '')).toBe('1200');
    });
  });

  describe('stockStateOf', () => {
    it('lowStock=true → low', () => expect(stockStateOf(true)).toBe('low'));
    it('lowStock=false → ok', () => expect(stockStateOf(false)).toBe('ok'));
  });

  describe('toStockItemVM', () => {
    it('string son → number, lowStock api dan koʻchiriladi', () => {
      const vm = toStockItemVM(item({ quantity: '12.50', minThreshold: '5', lowStock: false }));
      expect(vm.quantity).toBe(12.5);
      expect(vm.minThreshold).toBe(5);
      expect(vm.lowStock).toBe(false);
      expect(vm.stockState).toBe('ok');
    });

    it('category passthrough, price string → number (null → null)', () => {
      expect(toStockItemVM(item({ category: 'Terapevtika', price: '15000.00' }))).toMatchObject({
        category: 'Terapevtika',
        price: 15000,
      });
      const noPrice = toStockItemVM(item({ category: null, price: null }));
      expect(noPrice.category).toBeNull();
      expect(noPrice.price).toBeNull();
    });

    it('lowStock=true → stockState=low (mijozda qayta hisoblamaydi)', () => {
      // API low deb belgiladi, garchi quantity > minThreshold koʻrinsa ham — API hokim.
      const vm = toStockItemVM(item({ quantity: '100', minThreshold: '5', lowStock: true }));
      expect(vm.lowStock).toBe(true);
      expect(vm.stockState).toBe('low');
    });
  });

  describe('toStockMovementVM', () => {
    it('string son → number', () => {
      const m: StockMovement = {
        id: 'm1',
        tenantId: 't',
        itemId: 'i1',
        type: 'out',
        quantity: '3',
        reason: 'visit_auto',
        sourceVisitNoteId: 'v1',
        createdBy: null,
        createdAt: '2026-06-11T00:00:00Z',
      };
      const vm = toStockMovementVM(m);
      expect(vm.quantity).toBe(3);
      expect(vm.type).toBe('out');
      expect(vm.sourceVisitNoteId).toBe('v1');
    });
  });

  describe('toServiceMaterialVM', () => {
    it('qtyPerService string → number', () => {
      const sm: ServiceMaterial = {
        id: 'sm1',
        tenantId: 't',
        serviceId: 's1',
        itemId: 'i1',
        qtyPerService: '2.5',
        createdAt: '2026-06-11T00:00:00Z',
      };
      expect(toServiceMaterialVM(sm).qtyPerService).toBe(2.5);
    });
  });
});

describe('UI-M5 «necha kunga yetadi»', () => {
  it('daysStateOf: null → none (cheksiz), ≤5 kritik, ≤14 yaqin, qolgani ok', () => {
    expect(daysStateOf(null)).toBe('none');
    expect(daysStateOf(0)).toBe('critical');
    expect(daysStateOf(5)).toBe('critical');
    expect(daysStateOf(6)).toBe('soon');
    expect(daysStateOf(14)).toBe('soon');
    expect(daysStateOf(15)).toBe('ok');
  });

  it('toStockItemVM: daysLeft/avgDailyUsage API’dan; yo‘q bo‘lsa null/0', () => {
    expect(toStockItemVM(item({ daysLeft: 3, avgDailyUsage: '1.50' }))).toMatchObject({
      daysLeft: 3,
      avgDailyUsage: 1.5,
      daysState: 'critical',
    });
    expect(toStockItemVM(item())).toMatchObject({
      daysLeft: null,
      avgDailyUsage: 0,
      daysState: 'none',
    });
  });

  it('sortCriticalFirst: kam kun avval, null (sarf yo‘q) oxirida', () => {
    const vm = (name: string, daysLeft: number | null) => toStockItemVM(item({ name, daysLeft }));
    const sorted = sortCriticalFirst([vm('C', null), vm('B', 12), vm('A', 3)]);
    expect(sorted.map((i) => i.name)).toEqual(['A', 'B', 'C']);
  });

  it('toExpiringBatchVMs: muddatsizni tashlaydi, o‘tganini belgilaydi, muddat bo‘yicha tartiblaydi', () => {
    const now = new Date('2026-11-11T00:00:00Z');
    const row = (id: string, expiryDate: string | null) => ({
      id,
      itemId: 'i',
      itemName: 'Lidokain',
      unit: 'karpula',
      batchNumber: id,
      supplierName: null,
      expiryDate,
      qtyRemaining: '14.00',
    });
    const out = toExpiringBatchVMs(
      [row('late', '2026-12-01T00:00:00Z'), row('none', null), row('past', '2026-11-01T00:00:00Z')],
      now,
    );
    expect(out.map((b) => b.id)).toEqual(['past', 'late']);
    expect(out[0]?.expired).toBe(true);
    expect(out[1]?.expired).toBe(false);
    expect(out[1]?.qtyRemaining).toBe(14);
  });

  it('servicesByItem: takrorsiz, noma’lum xizmat tashlanadi', () => {
    const names: Record<string, string> = { s1: 'Plomba', s2: 'Kanal' };
    const map = servicesByItem(
      [
        { id: '1', serviceId: 's1', itemId: 'i1', qtyPerService: 1 },
        { id: '2', serviceId: 's1', itemId: 'i1', qtyPerService: 2 },
        { id: '3', serviceId: 's2', itemId: 'i1', qtyPerService: 1 },
        { id: '4', serviceId: 'gone', itemId: 'i1', qtyPerService: 1 },
      ],
      (id) => names[id],
    );
    expect(map.get('i1')).toEqual(['Plomba', 'Kanal']);
  });
});
