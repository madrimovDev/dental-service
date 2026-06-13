import { z } from '@hono/zod-openapi';

// ─── Request schemas (SAQLANADI — hand client REQUEST tiplari) ───────────────

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

/** Path param `{id}` — transaction id. */
export const transactionIdParamSchema = z.object({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
});

/** Path param `{planId}` — treatment plan id. */
export const planIdParamSchema = z.object({
  planId: z.uuid().openapi({ param: { name: 'planId', in: 'path' } }),
});

/** Daily-summary query — branchId majburiy (yo'qligida 400), date ixtiyoriy (default: bugun). */
export const dailySummaryQuery = z.object({
  branchId: z.uuid(),
  date: z.iso.date().optional(),
});
export type DailySummaryQuery = z.infer<typeof dailySummaryQuery>;

/** Patient-plans query — kassa plan-billing uchun bemor filtri (majburiy). */
export const patientPlansQuery = z.object({
  patientId: z.uuid(),
});
export type PatientPlansQuery = z.infer<typeof patientPlansQuery>;

// ─── Response DTOs (money numeric → string; Date → ISO string) ───────────────

const paymentMethodSchema = z.enum(['cash', 'card', 'transfer', 'other']);
const transactionTypeSchema = z.enum(['payment', 'refund', 'void']);
const transactionStatusSchema = z.enum(['pending', 'completed', 'voided']);

/** Bare transaction DTO — `list` shu shaklni qaytaradi (items YO'Q). */
export const cashierTransactionDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    branchId: z.uuid(),
    patientId: z.uuid().nullable(),
    treatmentPlanId: z.uuid().nullable(),
    receiptNumber: z.string().nullable(),
    totalAmount: z.string(),
    paidAmount: z.string(),
    discount: z.string(),
    currency: z.string(),
    paymentMethod: paymentMethodSchema,
    type: transactionTypeSchema,
    parentTransactionId: z.uuid().nullable(),
    status: transactionStatusSchema,
    notes: z.string().nullable(),
    fiscalProvider: z.string(),
    fiscalReceiptId: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('CashierTransaction');
export type CashierTransactionDto = z.infer<typeof cashierTransactionDtoSchema>;

export const cashierTransactionItemDtoSchema = z
  .object({
    id: z.uuid(),
    transactionId: z.uuid(),
    serviceId: z.uuid().nullable(),
    serviceName: z.string(),
    quantity: z.number().int(),
    unitPrice: z.string(),
    subtotal: z.string(),
  })
  .openapi('CashierTransactionItem');
export type CashierTransactionItemDto = z.infer<typeof cashierTransactionItemDtoSchema>;

/** Transaction + items — `get` / `create` / `refund` shu shaklni qaytaradi. */
export const cashierTransactionWithItemsDtoSchema = cashierTransactionDtoSchema
  .extend({
    items: z.array(cashierTransactionItemDtoSchema),
  })
  .openapi('CashierTransactionWithItems');
export type CashierTransactionWithItemsDto = z.infer<typeof cashierTransactionWithItemsDtoSchema>;

/** Paginated list — `{ data, meta }` (ok() envelope ichida). */
export const cashierListResponseDtoSchema = z
  .object({
    data: z.array(cashierTransactionDtoSchema),
    meta: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  })
  .openapi('CashierListResponse');
export type CashierListResponseDto = z.infer<typeof cashierListResponseDtoSchema>;

/** Kunlik summary — kassa yopilishi uchun (breakdown.total = numeric → string). */
export const dailySummaryDtoSchema = z
  .object({
    date: z.string(),
    branchId: z.uuid(),
    breakdown: z.array(
      z.object({
        paymentMethod: paymentMethodSchema,
        type: transactionTypeSchema,
        total: z.string(),
        count: z.number().int(),
      }),
    ),
  })
  .openapi('DailySummary');
export type DailySummaryDto = z.infer<typeof dailySummaryDtoSchema>;

/** Plan balansi — billing SOF funksiyasi NUMBER qaytaradi (money=string ISTISNOSI). */
export const stageBalanceDtoSchema = z
  .object({
    stageId: z.uuid(),
    serviceName: z.string(),
    cost: z.number(),
    paid: z.number(),
    remaining: z.number(),
  })
  .openapi('StageBalance');
export type StageBalanceDto = z.infer<typeof stageBalanceDtoSchema>;

export const planBalanceDtoSchema = z
  .object({
    totalCost: z.number(),
    totalPaid: z.number(),
    balance: z.number(),
    stages: z.array(stageBalanceDtoSchema),
  })
  .openapi('PlanBalance');
export type PlanBalanceDto = z.infer<typeof planBalanceDtoSchema>;

/**
 * Bemor davolash rejasi — kassa plan-billing selektori uchun yengil DTO (CLI-155).
 * `cashier.view` bilan ochiq (`medical_record.view` klinik-darajali emas) — shunda
 * Receptionist/kassir reja bo'yicha to'lov qabul qila oladi. Balans alohida
 * `GET /plan-balance/{planId}` (ham `cashier.view`) orqali olinadi.
 */
export const cashierPatientPlanDtoSchema = z
  .object({
    id: z.uuid(),
    title: z.string().openapi({ example: 'Kompleks davolash' }),
    status: z
      .enum(['draft', 'presented', 'accepted', 'in_progress', 'completed', 'cancelled'])
      .openapi({ example: 'accepted' }),
  })
  .openapi('CashierPatientPlan');
export type CashierPatientPlanDto = z.infer<typeof cashierPatientPlanDtoSchema>;
