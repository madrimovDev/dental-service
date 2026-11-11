import { z } from 'zod';
import { LAB_ORDER_TYPES, LAB_REMAKE_REASONS } from './lab-order.helpers';

/**
 * UI-D5 forma: rang (`shade`) va kerakli sana (`dueDate`) MAJBURIY. Xato matni —
 * i18n KALITI (`labOrder.err_*`), komponent `t()` bilan ko'rsatadi.
 */
export const labOrderFormSchema = z
  .object({
    labName: z.string().trim().min(1, 'labOrder.err_lab'),
    orderType: z.enum(LAB_ORDER_TYPES),
    toothNumbersText: z.string(),
    material: z.string(),
    description: z.string(),
    shade: z.string().trim().min(1, 'labOrder.err_shade'),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'labOrder.err_due'),
    cost: z.number().nonnegative().optional(),
    notes: z.string(),
    isRemake: z.boolean(),
    remakeOfId: z.string().nullable(),
    remakeReason: z.enum(LAB_REMAKE_REASONS).nullable(),
  })
  .superRefine((v, ctx) => {
    if (!v.isRemake) return;
    if (!v.remakeOfId) {
      ctx.addIssue({
        code: 'custom',
        path: ['remakeOfId'],
        message: 'labOrder.err_remake_original',
      });
    }
    if (!v.remakeReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['remakeReason'],
        message: 'labOrder.err_remake_reason',
      });
    }
  });
export type LabOrderFormValues = z.infer<typeof labOrderFormSchema>;
