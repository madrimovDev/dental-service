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

// ─── Request schemas ───────────────────────────────────────────────────────────

export const createLabOrderSchema = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  labName: z.string().min(1).max(200),
  orderType: orderTypeSchema,
  items: z.array(labOrderItemSchema).min(1),
  expectedDate: z.iso.datetime().optional(),
  cost: z.coerce.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateLabOrderInput = z.infer<typeof createLabOrderSchema>;

export const updateLabOrderSchema = z.object({
  labName: z.string().min(1).max(200).optional(),
  orderType: orderTypeSchema.optional(),
  status: orderStatusSchema.optional(),
  items: z.array(labOrderItemSchema).optional(),
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
    cost: z.string().nullable().openapi({ example: '150000.00' }),
    currency: z.string().openapi({ example: 'UZS' }),
    notes: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('LabOrder');

export type LabOrderDto = z.infer<typeof labOrderDtoSchema>;
