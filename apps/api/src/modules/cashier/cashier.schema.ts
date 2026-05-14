import { z } from 'zod';

export const createTransactionSchema = z.object({
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
    .min(1),
  discount: z.coerce.number().nonnegative().default(0),
  paidAmount: z.coerce.number().nonnegative(),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']),
  notes: z.string().max(1000).optional(),
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
