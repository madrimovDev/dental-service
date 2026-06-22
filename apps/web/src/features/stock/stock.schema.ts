import { z } from 'zod';

/** Yangi ombor item formasi. */
export const itemFormSchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(32),
  branchId: z.string().optional(),
  quantity: z.coerce.number().nonnegative(),
  minThreshold: z.coerce.number().nonnegative(),
});
export type ItemFormSchema = z.infer<typeof itemFormSchema>;

/** Manual harakat formasi (in/out/adjustment). Asistent "chiqim" = type=out. */
export const movementFormSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(['in', 'out', 'adjustment']),
  quantity: z.coerce.number().positive(),
  reason: z.string().max(200).optional(),
});
export type MovementFormSchema = z.infer<typeof movementFormSchema>;

/** BOM (xizmat → material) formasi. */
export const bomFormSchema = z.object({
  serviceId: z.string().min(1),
  itemId: z.string().min(1),
  qtyPerService: z.coerce.number().positive(),
});
export type BomFormSchema = z.infer<typeof bomFormSchema>;

/** Partiya qabul qilish formasi (V2-2) — supplier/batch#/expiry/cost ixtiyoriy. */
export const batchFormSchema = z.object({
  itemId: z.string().min(1),
  qtyReceived: z.coerce.number().positive(),
  supplierName: z.string().max(200).optional(),
  batchNumber: z.string().max(100).optional(),
  expiryDate: z.string().optional(),
  costPerUnit: z.union([z.coerce.number().nonnegative(), z.literal('')]).optional(),
});
export type BatchFormSchema = z.infer<typeof batchFormSchema>;
