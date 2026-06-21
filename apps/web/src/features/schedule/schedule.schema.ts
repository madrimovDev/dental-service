import { z } from 'zod';

/** Time-off forma sxemasi (@mantine/form + zod4Resolver). */
export const timeOffSchema = z
  .object({
    doctorId: z.string().min(1),
    branchId: z.string().nullable().default(null),
    type: z.enum(['vacation', 'sick', 'personal', 'other']),
    startDate: z.date(),
    endDate: z.date(),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, {
    message: 'time_off.range_invalid',
    path: ['endDate'],
  });

export type TimeOffValues = z.infer<typeof timeOffSchema>;
