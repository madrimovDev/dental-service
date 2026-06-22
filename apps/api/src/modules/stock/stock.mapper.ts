import type { ServiceMaterial, StockBatch, StockItem, StockMovement } from '@dental/db-schema';
import type {
  ServiceMaterialDto,
  StockBatchDto,
  StockItemDto,
  StockItemWithLowStockDto,
  StockMovementDto,
} from './stock.schema.ts';

/**
 * DB row (Date timestamps) → wire DTO (ISO strings).
 * numeric ustunlar (quantity, minThreshold, qtyPerService) Drizzle'da allaqachon string —
 * verbatim o'tadi, transform yo'q. Bu jadvallarda `deletedAt` yo'q.
 */
export const toStockItemDto = (row: StockItem): StockItemDto => ({
  id: row.id,
  tenantId: row.tenantId,
  branchId: row.branchId ?? null,
  name: row.name,
  unit: row.unit,
  quantity: row.quantity,
  minThreshold: row.minThreshold,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export const toStockItemWithLowStockDto = (
  row: StockItem & { lowStock: boolean },
): StockItemWithLowStockDto => ({
  ...toStockItemDto(row),
  lowStock: row.lowStock,
});

export const toStockMovementDto = (row: StockMovement): StockMovementDto => ({
  id: row.id,
  tenantId: row.tenantId,
  itemId: row.itemId,
  type: row.type,
  quantity: row.quantity,
  reason: row.reason ?? null,
  sourceVisitNoteId: row.sourceVisitNoteId ?? null,
  createdBy: row.createdBy ?? null,
  createdAt: row.createdAt.toISOString(),
});

export const toServiceMaterialDto = (row: ServiceMaterial): ServiceMaterialDto => ({
  id: row.id,
  tenantId: row.tenantId,
  serviceId: row.serviceId,
  itemId: row.itemId,
  qtyPerService: row.qtyPerService,
  createdAt: row.createdAt.toISOString(),
});

export const toStockBatchDto = (row: StockBatch): StockBatchDto => ({
  id: row.id,
  tenantId: row.tenantId,
  itemId: row.itemId,
  supplierName: row.supplierName ?? null,
  batchNumber: row.batchNumber ?? null,
  expiryDate: row.expiryDate ? row.expiryDate.toISOString() : null,
  costPerUnit: row.costPerUnit ?? null,
  qtyReceived: row.qtyReceived,
  receivedAt: row.receivedAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
});
