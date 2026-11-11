import { LAB_REMAKE_REASONS } from '@dental/db-schema';
import { z } from '@hono/zod-openapi';

// ─── Shared enums ──────────────────────────────────────────────────────────────

const labOrderItemSchema = z.object({
  description: z.string().min(1).max(500),
  toothNumbers: z.array(z.coerce.number().int().min(11).max(85)).optional(),
  material: z.string().max(100).optional(),
  shade: z.string().max(20).optional(),
  quantity: z.coerce.number().int().positive().optional(),
});

const orderTypeSchema = z.enum([
  'crown',
  'bridge',
  'prosthetic',
  'aligners',
  'denture',
  'inlay_onlay',
  'other',
]);

const orderStatusSchema = z.enum([
  'draft',
  'sent',
  'in_progress',
  'ready',
  'delivered',
  'cancelled',
]);

const remakeReasonSchema = z.enum(LAB_REMAKE_REASONS);

// ─── Request schemas ───────────────────────────────────────────────────────────

/**
 * UI-D5: YANGI buyurtmada `shade` (rang) va `dueDate` (kerakli sana, YYYY-MM-DD) MAJBURIY —
 * eski qatorlarda DB'da NULL (tarixiy), shuning uchun majburiylik faqat shu create schema'da.
 * Remake: `remakeOfId` + `remakeReason` faqat JUFT.
 */
export const createLabOrderSchema = z
  .object({
    patientId: z.uuid(),
    doctorId: z.uuid(),
    labName: z.string().min(1).max(200),
    orderType: orderTypeSchema,
    items: z.array(labOrderItemSchema).min(1),
    shade: z.string().trim().min(1).max(20),
    dueDate: z.iso.date(),
    expectedDate: z.iso.datetime().optional(),
    remakeOfId: z.uuid().optional(),
    remakeReason: remakeReasonSchema.optional(),
    cost: z.coerce.number().nonnegative().optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((v) => (v.remakeOfId === undefined) === (v.remakeReason === undefined), {
    message: 'remakeOfId and remakeReason must be provided together',
    path: ['remakeReason'],
  });
export type CreateLabOrderInput = z.infer<typeof createLabOrderSchema>;

export const updateLabOrderSchema = z.object({
  labName: z.string().min(1).max(200).optional(),
  orderType: orderTypeSchema.optional(),
  status: orderStatusSchema.optional(),
  items: z.array(labOrderItemSchema).optional(),
  shade: z.string().trim().min(1).max(20).optional(),
  dueDate: z.iso.date().optional(),
  sentDate: z.iso.datetime().nullable().optional(),
  expectedDate: z.iso.datetime().nullable().optional(),
  deliveredDate: z.iso.datetime().nullable().optional(),
  cost: z.coerce.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateLabOrderInput = z.infer<typeof updateLabOrderSchema>;

/** Path param for /:id routes */
export const labOrderIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ─── Query schema ──────────────────────────────────────────────────────────────

/** DS7: tenant-wide yoki patient-filtered ro'yxat + status filtri + pagination. */
export const listLabOrdersQuerySchema = z.object({
  patientId: z.uuid().optional().openapi({ description: 'Filter by patient UUID' }),
  status: orderStatusSchema.optional().openapi({ description: 'Filter by order status' }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListLabOrdersQuery = z.infer<typeof listLabOrdersQuerySchema>;

// ─── Response DTO ──────────────────────────────────────────────────────────────

/** Response DTO — wire shape (timestamps ISO string, nullable fields preserved). */
export const labOrderDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    patientId: z.uuid(),
    doctorId: z.uuid(),
    orderNumber: z.number().int().nullable().openapi({ example: 1 }),
    labName: z.string().openapi({ example: 'Best Dental Lab' }),
    orderType: orderTypeSchema.openapi({ example: 'crown' }),
    status: orderStatusSchema.openapi({ example: 'draft' }),
    items: z.array(labOrderItemSchema),
    sentDate: z.string().nullable().openapi({ example: null }),
    expectedDate: z.string().nullable().openapi({ example: '2026-07-01T10:00:00.000Z' }),
    deliveredDate: z.string().nullable().openapi({ example: null }),
    dueDate: z.string().nullable().openapi({ example: '2026-11-18' }),
    shade: z.string().nullable().openapi({ example: 'A3' }),
    remakeOfId: z.uuid().nullable().openapi({ example: null }),
    remakeReason: remakeReasonSchema.nullable().openapi({ example: null }),
    cost: z.string().nullable().openapi({ example: '150000.00' }),
    currency: z.string().openapi({ example: 'UZS' }),
    notes: z.string().nullable().openapi({ example: null }),
    // Lab Hub (W2 clinic-sync) — hammasi NULL = Hub'ga yuborilmagan.
    labHubLabId: z.uuid().nullable().openapi({ example: null }),
    hubSyncStatus: z.enum(['pending', 'synced', 'failed']).nullable().openapi({ example: null }),
    hubStatus: z.string().nullable().openapi({ example: null }),
    hubRejectReason: z.string().nullable().openapi({ example: null }),
    proposedPrice: z.string().nullable().openapi({ example: null }),
    approvedPrice: z.string().nullable().openapi({ example: null }),
    approvedAt: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('LabOrder');

export type LabOrderDto = z.infer<typeof labOrderDtoSchema>;

/** DS7 — paginated list response (`{ data, meta }` inside `ok()` envelope). */
export const labOrderListResponseDtoSchema = z
  .object({
    data: z.array(labOrderDtoSchema),
    meta: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  })
  .openapi('LabOrderListResponse');
export type LabOrderListResponseDto = z.infer<typeof labOrderListResponseDtoSchema>;

// ─── Fayllar (UI-D5) ───────────────────────────────────────────────────────────

/** Ruxsat etilgan lab fayl turlari → kengaytma (skan: STL/PLY/OBJ, surat, PDF). */
export const LAB_FILE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'model/stl': 'stl',
  'application/sla': 'stl',
  'model/ply': 'ply',
  'model/obj': 'obj',
};
/** Brauzerlar STL/PLY/OBJ uchun ko'pincha `application/octet-stream` yuboradi — kengaytma bo'yicha. */
export const LAB_FILE_EXTENSIONS = new Set(['stl', 'ply', 'obj']);
export const LAB_FILE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB (3D skan)

export const labOrderFileIdParamSchema = z.object({ id: z.uuid(), fileId: z.uuid() });

export const labOrderFileDtoSchema = z
  .object({
    id: z.uuid(),
    labOrderId: z.uuid(),
    label: z.string().nullable(),
    originalFilename: z.string(),
    contentType: z.string(),
    sizeBytes: z.number().int(),
    url: z.string().openapi({ example: '/uploads/tenants%2F...' }),
    createdAt: z.string(),
  })
  .openapi('LabOrderFile');
export type LabOrderFileDto = z.infer<typeof labOrderFileDtoSchema>;

export const labOrderFileDeleteSchema = z
  .object({ deleted: z.literal(true) })
  .openapi('LabOrderFileDelete');

// ─── Lab Hub (W2 clinic-sync) ─────────────────────────────────────────────────

export const sendToHubSchema = z.object({ labId: z.uuid() }).strict();

/**
 * Foydalanuvchi ekranda ko'rgan narx (`proposedPrice` satri, masalan `"350000.00"`).
 * Server qulflangan qatordagi taklif bilan solishtiradi — farq bo'lsa 409 `price.changed`.
 */
export const approvePriceSchema = z
  .object({
    price: z
      .union([
        z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
        z.number().nonnegative().max(999_999_999_999),
      ])
      .openapi({ example: '350000.00' }),
  })
  .strict()
  .openapi('LabOrderPriceApprovalRequest');

export const approvePriceResponseSchema = z
  .object({
    approvedPrice: z.string(),
    approvedAt: z.string().nullable(),
    alreadyApproved: z.boolean(),
    expenseId: z.uuid().nullable(),
  })
  .openapi('LabOrderPriceApproval');

export const hubMessageCreateSchema = z
  .object({ body: z.string().trim().min(1).max(5000) })
  .strict();

export const hubMessageDtoSchema = z
  .object({
    id: z.uuid(),
    labOrderId: z.uuid(),
    author: z.enum(['clinic', 'lab']),
    authorName: z.string().nullable(),
    kind: z.enum(['message', 'file']),
    body: z.string().nullable(),
    file: z
      .object({
        id: z.string(),
        fileName: z.string().nullable(),
        mimeType: z.string(),
        sizeBytes: z.number().int(),
      })
      .nullable(),
    synced: z.boolean(),
    createdAt: z.string(),
  })
  .openapi('LabOrderHubMessage');
export type HubMessageDto = z.infer<typeof hubMessageDtoSchema>;
