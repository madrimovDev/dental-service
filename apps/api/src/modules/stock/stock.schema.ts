import { z } from '@hono/zod-openapi';

// ===== Request schemas (SAQLANADI — generated *Body'dan farqli, request manbasi) =====
export const createItemSchema = z.object({
  branchId: z.uuid().optional(),
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(40),
  quantity: z.coerce.number().nonnegative().default(0),
  minThreshold: z.coerce.number().nonnegative().default(0),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.partial();
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const listItemsQuerySchema = z.object({
  branchId: z.uuid().optional(),
});
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

export const createMovementSchema = z.object({
  itemId: z.uuid(),
  type: z.enum(['in', 'out', 'adjustment']),
  quantity: z.coerce.number().positive(),
  reason: z.string().max(500).optional(),
});
export type CreateMovementInput = z.infer<typeof createMovementSchema>;

export const createBomSchema = z.object({
  serviceId: z.uuid(),
  itemId: z.uuid(),
  qtyPerService: z.coerce.number().positive(),
});
export type CreateBomInput = z.infer<typeof createBomSchema>;

/** Partiya qabul qilish (V2-2) — supplier/batch#/expiry/cost ixtiyoriy. */
export const createBatchSchema = z.object({
  itemId: z.uuid(),
  qtyReceived: z.coerce.number().positive(),
  supplierName: z.string().max(200).optional(),
  batchNumber: z.string().max(100).optional(),
  expiryDate: z.iso.datetime().optional(),
  costPerUnit: z.coerce.number().nonnegative().optional(),
});
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

// ===== Query schemas (route-level) =====
export const movementsQuerySchema = z.object({
  itemId: z.uuid(),
});

export const bomQuerySchema = z.object({
  serviceId: z.uuid().optional(),
});

export const batchesQuerySchema = z.object({
  itemId: z.uuid(),
});

export const expiringQuerySchema = z.object({
  withinDays: z.coerce.number().int().positive().max(365).optional(),
});

/** Path param — /items/{id} va /bom/{id} ikkalasi ham faqat `id`. */
export const stockIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ===== Response DTO (wire shape; numeric → string, timestamps ISO string) =====
const stockItemShape = {
  id: z.uuid(),
  tenantId: z.uuid(),
  branchId: z.uuid().nullable(),
  name: z.string().openapi({ example: 'Anestetik' }),
  unit: z.string().openapi({ example: 'dona' }),
  quantity: z.string().openapi({ example: '120.00' }),
  minThreshold: z.string().openapi({ example: '10.00' }),
  createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
};

export const stockItemDtoSchema = z.object(stockItemShape).openapi('StockItem');
export type StockItemDto = z.infer<typeof stockItemDtoSchema>;

export const stockItemWithLowStockDtoSchema = z
  .object({ ...stockItemShape, lowStock: z.boolean() })
  .openapi('StockItemWithLowStock');
export type StockItemWithLowStockDto = z.infer<typeof stockItemWithLowStockDtoSchema>;

export const stockMovementDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    itemId: z.uuid(),
    type: z.enum(['in', 'out', 'adjustment']),
    quantity: z.string().openapi({ example: '5.00' }),
    reason: z.string().nullable().openapi({ example: 'visit_auto' }),
    sourceVisitNoteId: z.uuid().nullable().openapi({ example: null }),
    createdBy: z.uuid().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('StockMovement');
export type StockMovementDto = z.infer<typeof stockMovementDtoSchema>;

export const serviceMaterialDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    serviceId: z.uuid(),
    itemId: z.uuid(),
    qtyPerService: z.string().openapi({ example: '2.00' }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('ServiceMaterial');
export type ServiceMaterialDto = z.infer<typeof serviceMaterialDtoSchema>;

export const stockBomDeleteResultSchema = z
  .object({ deleted: z.literal(true) })
  .openapi('StockBomDeleteResult');

export const stockBatchDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    itemId: z.uuid(),
    supplierName: z.string().nullable(),
    batchNumber: z.string().nullable(),
    expiryDate: z.string().nullable(),
    costPerUnit: z.string().nullable(),
    qtyReceived: z.string(),
    receivedAt: z.string(),
    createdAt: z.string(),
  })
  .openapi('StockBatch');
export type StockBatchDto = z.infer<typeof stockBatchDtoSchema>;
