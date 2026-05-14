import { z } from 'zod';

const workHours = z.record(
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
  workHours: workHours.optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial();
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
