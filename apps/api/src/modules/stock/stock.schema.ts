import { z } from '@hono/zod-openapi';

// ===== Request schemas (SAQLANADI — generated *Body'dan farqli, request manbasi) =====
export const createItemSchema = z.object({
  branchId: z.uuid().optional(),
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(40),
  // DS12 (DS9 ombor): kategoriya + birlik narxi — ixtiyoriy.
  category: z.string().max(100).optional(),
  price: z.coerce.number().nonnegative().optional(),
  quantity: z.coerce.number().nonnegative().default(0),
  minThreshold: z.coerce.number().nonnegative().default(0),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

// CLI-424: `quantity` PATCH-item'dan CHIQARILDI — qoldiq faqat movement (`createMovement`)
// yoki batch (`createBatch`) orqali o'zgaradi (Qaror #31, ledger yagona manba). `updateItem`
// faqat metadata: name/unit/category/price/branchId/minThreshold.
export const updateItemSchema = createItemSchema
  .omit({ quantity: true })
  .partial()
  // P12: default'siz (PATCH minThreshold'ni 0 ga tashlamasin)
  .extend({ minThreshold: z.coerce.number().nonnegative().optional() });
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const listItemsQuerySchema = z.object({
  branchId: z.uuid().optional(),
});
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

export const createMovementSchema = z
  .object({
    itemId: z.uuid(),
    type: z.enum(['in', 'out', 'adjustment']),
    // `in`/`out` → miqdor (> 0). `adjustment` → aniqlangan (sanalgan) qoldiq (>= 0,
    // set-to-value inventarizatsiya; 0 = "hech narsa qolmadi" qonuniy). superRefine quyida.
    quantity: z.coerce.number().nonnegative(),
    reason: z.string().max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type !== 'adjustment' && val.quantity <= 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'quantity must be greater than 0 for in/out movements',
      });
    }
  });
export type CreateMovementInput = z.infer<typeof createMovementSchema>;

export const createBomSchema = z.object({
  serviceId: z.uuid(),
  itemId: z.uuid(),
  qtyPerService: z.coerce.number().positive(),
});
export type CreateBomInput = z.infer<typeof createBomSchema>;

/** Partiya qabul qilish (V2-2) — supplier/batch#/expiry/cost ixtiyoriy. */
export const createBatchSchema = z
  .object({
    itemId: z.uuid(),
    qtyReceived: z.coerce.number().positive(),
    supplierName: z.string().max(200).optional(),
    batchNumber: z.string().max(100).optional(),
    expiryDate: z.iso.datetime().optional(),
    costPerUnit: z.coerce.number().nonnegative().optional(),
    // UI-M5: kirimni xarajatlarga ham yozish (ixtiyoriy). `expense.manage` + narx talab qilinadi.
    recordAsExpense: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.recordAsExpense && val.costPerUnit == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['costPerUnit'],
        message: 'costPerUnit is required when recordAsExpense is true',
      });
    }
  });
export type CreateBatchInput = z.infer<typeof createBatchSchema>;

// ===== Query schemas (route-level) =====
// CLI-442 #3: `page`/`pageSize` ixtiyoriy (additive, mavjud caller'lar buzilmaydi) —
// uzoq ishlagan itemda minglab movement bitta so'rovda qaytmasin.
export const movementsQuerySchema = z.object({
  itemId: z.uuid(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
});
export type ListMovementsQuery = z.infer<typeof movementsQuerySchema>;

export const bomQuerySchema = z.object({
  serviceId: z.uuid().optional(),
});

export const autoDeductionsQuerySchema = z.object({
  branchId: z.uuid().optional(),
});

export const batchesQuerySchema = z.object({
  itemId: z.uuid(),
});

export const expiringQuerySchema = z.object({
  withinDays: z.coerce.number().int().positive().max(365).optional(),
  // IR-02: filial filtri (tenant-darajali itemlar — branchId=null — har doim kiradi).
  branchId: z.uuid().optional(),
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
  // DS12 (DS9 ombor): kategoriya (nullable) + birlik narxi (numeric → string, nullable).
  category: z.string().nullable().openapi({ example: 'Anesteziya' }),
  price: z.string().nullable().openapi({ example: '15000.00' }),
  quantity: z.string().openapi({ example: '120.00' }),
  minThreshold: z.string().openapi({ example: '10.00' }),
  createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
};

export const stockItemDtoSchema = z.object(stockItemShape).openapi('StockItem');
export type StockItemDto = z.infer<typeof stockItemDtoSchema>;

export const stockItemWithLowStockDtoSchema = z
  .object({
    ...stockItemShape,
    lowStock: z.boolean(),
    // UI-M5: oxirgi 30 kun o'rtacha kunlik sarf (numeric → string) va «necha kunga yetadi»
    // (sarf 0 → null = cheksiz).
    avgDailyUsage: z.string().openapi({ example: '1.50' }),
    daysLeft: z.number().int().nullable().openapi({ example: 12 }),
  })
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

/** `batches/expiring` — partiya + item nomi/birligi + FIFO bo'yicha qoldiq (IR-02). */
export const expiringStockBatchDtoSchema = stockBatchDtoSchema
  .extend({
    itemName: z.string().openapi({ example: 'Lidokain 2%' }),
    unit: z.string().openapi({ example: 'karpula' }),
    qtyRemaining: z.string().openapi({ example: '14.00' }),
  })
  .openapi('ExpiringStockBatch');
export type ExpiringStockBatchDto = z.infer<typeof expiringStockBatchDtoSchema>;

/** Bugungi avto-yechish jurnali qatori (vizit yozuvidan kelgan chiqim / qaytarish). */
export const autoDeductionDtoSchema = z
  .object({
    id: z.uuid(),
    itemId: z.uuid(),
    itemName: z.string(),
    unit: z.string(),
    type: z.enum(['in', 'out', 'adjustment']),
    quantity: z.string().openapi({ example: '1.00' }),
    reason: z.string().nullable().openapi({ example: 'visit_auto' }),
    doctorName: z.string().nullable().openapi({ example: 'Karimov' }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('StockAutoDeduction');
export type AutoDeductionDto = z.infer<typeof autoDeductionDtoSchema>;
