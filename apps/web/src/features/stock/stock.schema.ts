import { z } from 'zod';

/** Yangi ombor item formasi. */
export const itemFormSchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(32),
  // FX-165: Mantine Select tozalanganda `null` beradi — `undefined` ham, `null` ham ruxsat.
  branchId: z.string().nullish(),
  /** Kategoriya / dona narxi — ixtiyoriy (FX-129). Narx bo'sh = belgilanmagan. */
  category: z.string().max(100).optional(),
  price: z.union([z.coerce.number().nonnegative(), z.literal('')]).optional(),
  /** Faqat yaratishda; tahrirda qoldiq harakat orqali o'zgaradi (CLI-424). */
  quantity: z.coerce.number().nonnegative(),
  minThreshold: z.coerce.number().nonnegative(),
});
export type ItemFormSchema = z.infer<typeof itemFormSchema>;

/** Manual harakat formasi (in/out/adjustment). Asistent "chiqim" = type=out. */
// FX-43: `adjustment` = sanalgan (aniqlangan) qoldiq, set-to-value — 0 qonuniy («hammasi tugadi»);
// in/out uchun miqdor > 0. API (`createMovementSchema`) bilan bir xil.
export const movementFormSchema = z
  .object({
    itemId: z.string().min(1),
    type: z.enum(['in', 'out', 'adjustment']),
    quantity: z.coerce.number().nonnegative(),
    reason: z.string().max(200).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type !== 'adjustment' && val.quantity <= 0) {
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'quantity must be > 0' });
    }
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
  recordAsExpense: z.boolean().optional(),
});
export type BatchFormSchema = z.infer<typeof batchFormSchema>;
