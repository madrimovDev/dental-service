import type { ServiceMaterial, StockMovement, StockMovementType } from '@dental/api-client';

/** Ombor item view-model'i (string son → number, lowStock api'dan). */
export type StockItemVM = {
  id: string;
  branchId: string | null;
  name: string;
  unit: string;
  quantity: number;
  minThreshold: number;
  /** Backend `isLowStock` natijasi (`StockItemWithLowStock.lowStock`). */
  lowStock: boolean;
  /** lowStock'dan kelib chiqqan badge holati (UI uchun). */
  stockState: StockState;
};

/** Qoldiq holati: kam-qoldi (yellow/red) yoki yetarli. */
export type StockState = 'low' | 'ok';

/** Harakat tarixi satri view-model'i. */
export type StockMovementVM = {
  id: string;
  itemId: string;
  type: StockMovementType;
  quantity: number;
  reason: string | null;
  sourceVisitNoteId: string | null;
  createdAt: string;
};

/** BOM (service → material) satri view-model'i. */
export type ServiceMaterialVM = {
  id: string;
  serviceId: string;
  itemId: string;
  qtyPerService: number;
};

export type { ServiceMaterial, StockMovement, StockMovementType };
