import { z } from '@hono/zod-openapi';

/** JSONB workHours shape — DTO va request ikkalasida ham ishlatiladi. */
const workHoursSchema = z.record(
  z.string(),
  z.union([z.object({ open: z.string(), close: z.string() }), z.null()]),
);

export const createBranchSchema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().max(500).optional(),
  phone: z
    .string()
    .regex(/^\+?\d{9,15}$/)
    .optional(),
  workHours: workHoursSchema.optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial();
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

/** Path param schema for routes requiring :id */
export const branchIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

/** Response DTO — wire shape (timestamps ISO string, nullable fields nullable). `.openapi()` ref. */
export const branchDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    name: z.string().openapi({ example: 'Main Branch' }),
    address: z.string().nullable().openapi({ example: 'Toshkent, Chilonzor' }),
    phone: z.string().nullable().openapi({ example: '+998901234567' }),
    workHours: workHoursSchema.nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    deletedAt: z.string().nullable().openapi({ example: null }),
  })
  .openapi('Branch');

export type BranchDto = z.infer<typeof branchDtoSchema>;

/** DELETE response DTO */
export const branchDeleteResultSchema = z
  .object({
    deleted: z.literal(true),
    id: z.uuid(),
  })
  .openapi('BranchDeleteResult');
