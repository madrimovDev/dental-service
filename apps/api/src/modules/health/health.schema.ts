import { z } from 'zod';

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  db: z.enum(['up', 'down']),
  ts: z.iso.datetime(),
  /** FX-145 — faqat desktop server rejimida. */
  serverId: z.string().optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
