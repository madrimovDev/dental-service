import { z } from 'zod';

const labOrderItemSchema = z.object({
  description: z.string().min(1).max(500),
  toothNumbers: z.array(z.coerce.number().int().min(11).max(85)).optional(),
  material: z.string().max(100).optional(),
  shade: z.string().max(20).optional(),
  quantity: z.coerce.number().int().positive().optional(),
});

const orderType = z.enum([
  'crown',
  'bridge',
  'prosthetic',
  'aligners',
  'denture',
  'inlay_onlay',
  'other',
]);

const orderStatus = z.enum(['draft', 'sent', 'in_progress', 'ready', 'delivered', 'cancelled']);

export const createLabOrderSchema = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  labName: z.string().min(1).max(200),
  orderType,
  items: z.array(labOrderItemSchema).min(1),
  expectedDate: z.iso.datetime().optional(),
  cost: z.coerce.number().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateLabOrderInput = z.infer<typeof createLabOrderSchema>;

export const updateLabOrderSchema = z.object({
  labName: z.string().min(1).max(200).optional(),
  orderType: orderType.optional(),
  status: orderStatus.optional(),
  items: z.array(labOrderItemSchema).optional(),
  sentDate: z.iso.datetime().nullable().optional(),
  expectedDate: z.iso.datetime().nullable().optional(),
  deliveredDate: z.iso.datetime().nullable().optional(),
  cost: z.coerce.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type UpdateLabOrderInput = z.infer<typeof updateLabOrderSchema>;
