import { z } from 'zod';

// ===== Stock Items =====
export const createItemSchema = z.object({
  branchId: z.uuid().optional(),
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(40),
  quantity: z.coerce.number().nonnegative().default(0),
  minThreshold: z.coerce.number().nonnegative().default(0),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.partial();
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const listItemsQuerySchema = z.object({
  branchId: z.uuid().optional(),
});
export type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

// ===== Stock Movements =====
export const createMovementSchema = z.object({
  itemId: z.uuid(),
  type: z.enum(['in', 'out', 'adjustment']),
  quantity: z.coerce.number().positive(),
  reason: z.string().max(500).optional(),
});
export type CreateMovementInput = z.infer<typeof createMovementSchema>;

// ===== BOM (service → material normalari) =====
export const createBomSchema = z.object({
  serviceId: z.uuid(),
  itemId: z.uuid(),
  qtyPerService: z.coerce.number().positive(),
});
export type CreateBomInput = z.infer<typeof createBomSchema>;
