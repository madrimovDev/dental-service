import type { ServiceMaterial, StockItemWithLowStock, StockMovement } from '@dental/api-client';
import type { ServiceMaterialVM, StockItemVM, StockMovementVM, StockState } from './stock.types';

/** Son formatlash (minglik ajratgich, valyutasiz — bu MIQDOR, pul emas). */
export function formatQty(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n);
}

/** API `lowStock` boolean'idan badge holati. */
export function stockStateOf(lowStock: boolean): StockState {
  return lowStock ? 'low' : 'ok';
}

/** StockItemWithLowStock → VM (string son → number, lowStock api'dan ko'chiriladi). */
export function toStockItemVM(item: StockItemWithLowStock): StockItemVM {
  return {
    id: item.id,
    branchId: item.branchId,
    name: item.name,
    unit: item.unit,
    category: item.category,
    price: item.price == null ? null : Number(item.price),
    quantity: Number(item.quantity),
    minThreshold: Number(item.minThreshold),
    lowStock: item.lowStock,
    stockState: stockStateOf(item.lowStock),
  };
}

/** StockMovement → VM (string son → number). */
export function toStockMovementVM(m: StockMovement): StockMovementVM {
  return {
    id: m.id,
    itemId: m.itemId,
    type: m.type,
    quantity: Number(m.quantity),
    reason: m.reason,
    sourceVisitNoteId: m.sourceVisitNoteId,
    createdAt: m.createdAt,
  };
}

/** ServiceMaterial → VM (string son → number). */
export function toServiceMaterialVM(sm: ServiceMaterial): ServiceMaterialVM {
  return {
    id: sm.id,
    serviceId: sm.serviceId,
    itemId: sm.itemId,
    qtyPerService: Number(sm.qtyPerService),
  };
}
