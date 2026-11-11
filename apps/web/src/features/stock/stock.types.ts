import type {
  ServiceMaterial,
  StockItemWithLowStock,
  StockMovement,
  StockMovementType,
} from '@dental/api-client';

/**
 * UI-M5: `GET /stock/items` endi `avgDailyUsage` + `daysLeft` ham qaytaradi. Generated tip
 * `generate:contract`dan keyin ularni o'zi beradi (intersection shunda ham to'g'ri); shu paytgacha
 * ixtiyoriy deb olinadi.
 */
export type StockItemDto = StockItemWithLowStock & {
  avgDailyUsage?: string;
  daysLeft?: number | null;
};

/** «Necha kunga yetadi» holati: ≤5 kun — kritik, ≤14 — yaqin, null — sarf yo'q (cheksiz). */
export type DaysState = 'critical' | 'soon' | 'ok' | 'none';

/** `GET /stock/batches/expiring` qatori (partiya + item nomi + FIFO qoldiq). */
export type ExpiringBatchDto = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  batchNumber: string | null;
  supplierName: string | null;
  expiryDate: string | null;
  qtyRemaining: string;
};

export type ExpiringBatchVM = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  batchNumber: string | null;
  expiryDate: Date;
  expired: boolean;
  qtyRemaining: number;
};

/** `GET /stock/auto-deductions/today` qatori. */
export type AutoDeductionDto = {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  type: StockMovementType;
  quantity: string;
  reason: string | null;
  doctorName: string | null;
  createdAt: string;
};

/** Ombor item view-model'i (string son → number, lowStock api'dan). */
export type StockItemVM = {
  id: string;
  branchId: string | null;
  name: string;
  unit: string;
  /** Mahsulot kategoriyasi (ixtiyoriy). */
  category: string | null;
  /** Dona narxi (string son → number; belgilangan bo'lmasa null). */
  price: number | null;
  quantity: number;
  minThreshold: number;
  /** Backend `isLowStock` natijasi (`StockItemWithLowStock.lowStock`). */
  lowStock: boolean;
  /** lowStock'dan kelib chiqqan badge holati (UI uchun). */
  stockState: StockState;
  /** Oxirgi 30 kun o'rtacha kunlik sarf. */
  avgDailyUsage: number;
  /** Necha kunga yetadi; sarf 0 → null (cheksiz, «—»). */
  daysLeft: number | null;
  daysState: DaysState;
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
