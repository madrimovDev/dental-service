import { z } from '@hono/zod-openapi';

// ─── Request schemas ─────────────────────────────────────────────────────────

export const createServiceSchema = z.object({
  code: z.string().min(1).max(64),
  nameUz: z.string().min(2).max(200),
  nameRu: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
  durationMinutes: z.coerce.number().int().positive().default(30),
  requiredRole: z.string().max(50).optional(),
  descriptionUz: z.string().max(1000).optional(),
  descriptionRu: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
  // Inline default price for default branch
  initialPrice: z.coerce.number().nonnegative().optional(),
  initialBranchId: z.uuid().optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema
  .partial()
  .omit({ initialPrice: true, initialBranchId: true });
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const setServicePriceSchema = z.object({
  branchId: z.uuid(),
  price: z.coerce.number().nonnegative(),
  currency: z.string().max(8).default('UZS'),
});
export type SetServicePriceInput = z.infer<typeof setServicePriceSchema>;

// ─── Path param schema ────────────────────────────────────────────────────────

/** Path param schema for routes requiring :id */
export const serviceIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ─── Response DTOs ────────────────────────────────────────────────────────────

/** Service DTO — wire shape (timestamps ISO string). */
export const serviceDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    code: z.string().openapi({ example: 'PL-001' }),
    nameUz: z.string().openapi({ example: "Plomba qo'yish" }),
    nameRu: z.string().nullable().openapi({ example: 'Пломбирование' }),
    category: z.string().nullable().openapi({ example: 'Terapevtika' }),
    categoryId: z.uuid().nullable().openapi({ example: null }),
    categoryNameRu: z.string().nullable().openapi({ example: null }),
    durationMinutes: z.number().int().openapi({ example: 30 }),
    requiredRole: z.string().nullable().openapi({ example: 'doctor' }),
    descriptionUz: z.string().nullable().openapi({ example: null }),
    descriptionRu: z.string().nullable().openapi({ example: null }),
    isActive: z.boolean().openapi({ example: true }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    deletedAt: z.string().nullable().openapi({ example: null }),
  })
  .openapi('Service');

export type ServiceDto = z.infer<typeof serviceDtoSchema>;

/** ServicePrice DTO — wire shape (validFrom/validTo are date strings, createdAt is ISO). */
export const servicePriceDtoSchema = z
  .object({
    id: z.uuid(),
    serviceId: z.uuid(),
    branchId: z.uuid(),
    price: z.string().openapi({ example: '150000.00' }),
    currency: z.string().openapi({ example: 'UZS' }),
    validFrom: z.string().openapi({ example: '2026-06-12' }),
    validTo: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('ServicePrice');

export type ServicePriceDto = z.infer<typeof servicePriceDtoSchema>;

/** ServiceWithPrices DTO — service + active branch prices. */
export const serviceWithPricesDtoSchema = serviceDtoSchema
  .extend({
    prices: z.array(servicePriceDtoSchema),
  })
  .openapi('ServiceWithPrices');

export type ServiceWithPricesDto = z.infer<typeof serviceWithPricesDtoSchema>;

/** DELETE response DTO */
export const serviceDeleteResultSchema = z
  .object({
    deleted: z.literal(true),
  })
  .openapi('ServiceDeleteResult');
