import { z } from 'zod';

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  db: z.enum(['up', 'down']),
  ts: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
