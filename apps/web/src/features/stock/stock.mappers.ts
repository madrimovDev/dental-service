import type { ServiceMaterial, StockMovement } from '@dental/api-client';
import type {
  AutoDeductionDto,
  DaysState,
  ExpiringBatchDto,
  ExpiringBatchVM,
  ServiceMaterialVM,
  StockItemDto,
  StockItemVM,
  StockMovementVM,
  StockState,
} from './stock.types';

/** Son formatlash (minglik ajratgich, valyutasiz — bu MIQDOR, pul emas). */
export function formatQty(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n);
}

/** API `lowStock` boolean'idan badge holati. */
export function stockStateOf(lowStock: boolean): StockState {
  return lowStock ? 'low' : 'ok';
}

/** Kritik chegara (kun) — shu va undan kam → qizil «tugayapti». */
export const DAYS_CRITICAL = 5;
/** Yaqin chegara (kun) — shu va undan kam → sariq. */
export const DAYS_SOON = 14;

/** `daysLeft` → holat. `null` (sarf yo'q) = cheksiz → 'none' (bar bo'sh emas, «—»). */
export function daysStateOf(daysLeft: number | null): DaysState {
  if (daysLeft == null) return 'none';
  if (daysLeft <= DAYS_CRITICAL) return 'critical';
  if (daysLeft <= DAYS_SOON) return 'soon';
  return 'ok';
}

/** Tugayotganlar birinchi: kam kun avval, sarfi yo'q (null) oxirida; teng bo'lsa nom bo'yicha. */
export function sortCriticalFirst(items: StockItemVM[]): StockItemVM[] {
  return [...items].sort((a, b) => {
    const ad = a.daysLeft ?? Number.POSITIVE_INFINITY;
    const bd = b.daysLeft ?? Number.POSITIVE_INFINITY;
    return ad === bd ? a.name.localeCompare(b.name) : ad - bd;
  });
}

/** StockItemWithLowStock → VM (string son → number, lowStock api'dan ko'chiriladi). */
export function toStockItemVM(item: StockItemDto): StockItemVM {
  const daysLeft = item.daysLeft ?? null;
  return {
    avgDailyUsage: Number(item.avgDailyUsage ?? 0),
    daysLeft,
    daysState: daysStateOf(daysLeft),
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

/** Muddati yaqin partiya → VM. Sanasiz yozuv (xavfsizlik uchun) tashlanadi. */
export function toExpiringBatchVMs(rows: ExpiringBatchDto[], now = new Date()): ExpiringBatchVM[] {
  const out: ExpiringBatchVM[] = [];
  for (const r of rows) {
    if (!r.expiryDate) continue;
    const expiryDate = new Date(r.expiryDate);
    out.push({
      id: r.id,
      itemId: r.itemId,
      itemName: r.itemName,
      unit: r.unit,
      batchNumber: r.batchNumber,
      expiryDate,
      expired: expiryDate.getTime() < now.getTime(),
      qtyRemaining: Number(r.qtyRemaining),
    });
  }
  return out.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
}

/** BOM'dan: item → shu materialni ishlatadigan xizmat nomlari (takrorsiz, tartib saqlanadi). */
export function servicesByItem(
  bom: ServiceMaterialVM[],
  serviceName: (serviceId: string) => string | undefined,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const b of bom) {
    const name = serviceName(b.serviceId);
    if (!name) continue;
    const list = map.get(b.itemId) ?? [];
    if (!list.includes(name)) list.push(name);
    map.set(b.itemId, list);
  }
  return map;
}

/** Jurnal qatori vaqti `HH:mm` (qurilma mintaqasi). */
export function formatLogTime(iso: string): string {
  return new Intl.DateTimeFormat('uz-UZ', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export type { AutoDeductionDto };
