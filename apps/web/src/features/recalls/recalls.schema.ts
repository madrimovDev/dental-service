import { z } from 'zod';

/** Qo'lda recall yaratish forma sxemasi (@mantine/form + zod4Resolver). */
export const createRecallSchema = z.object({
  reason: z.enum(['preventive', 'treatment_followup', 'post_op_check', 'manual']),
  dueDate: z.date(),
  intervalMonths: z.number().int().min(1).max(120).nullable().default(null),
  notes: z.string().max(1000).optional(),
});

export type CreateRecallValues = z.infer<typeof createRecallSchema>;
