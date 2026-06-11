import { z } from 'zod';

export const createRunSchema = z.object({
  periodFrom: z.iso.date(),
  periodTo: z.iso.date(),
});
export type CreateRunInput = z.infer<typeof createRunSchema>;
