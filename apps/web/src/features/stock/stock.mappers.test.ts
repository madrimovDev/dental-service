import type { ServiceMaterial, StockItemWithLowStock, StockMovement } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import {
  formatQty,
  stockStateOf,
  toServiceMaterialVM,
  toStockItemVM,
  toStockMovementVM,
} from './stock.mappers';

function item(over: Partial<StockItemWithLowStock> = {}): StockItemWithLowStock {
  return {
    id: 'i1',
    tenantId: 't',
    branchId: 'b1',
    name: 'Anesteziya',
    unit: 'ml',
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
