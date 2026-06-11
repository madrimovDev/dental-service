import { z } from 'zod';

export const createTransactionSchema = z
  .object({
    branchId: z.uuid(),
    patientId: z.uuid().optional(),
    items: z
      .array(
        z.object({
          serviceId: z.uuid(),
          quantity: z.coerce.number().int().positive().default(1),
          unitPrice: z.coerce.number().nonnegative(),
          serviceName: z.string().min(1),
        }),
      )
      .default([]),
    discount: z.coerce.number().nonnegative().default(0),
    paidAmount: z.coerce.number().nonnegative(),
    paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']),
    notes: z.string().max(1000).optional(),
    treatmentPlanId: z.uuid().optional(),
    allocations: z
      .array(
        z.object({
          stageId: z.uuid(),
          amount: z.coerce.number().positive(),
        }),
      )
      .optional(),
  })
  // Erkin POS (items) yoki plan-billing (allocations) — kamida bittasi bo'lishi shart.
  .refine((v) => v.items.length > 0 || (v.allocations?.length ?? 0) > 0, {
    message: 'items yoki allocations talab qilinadi',
    path: ['items'],
  });
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const listTransactionsQuery = z.object({
  branchId: z.uuid().optional(),
  patientId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuery>;
