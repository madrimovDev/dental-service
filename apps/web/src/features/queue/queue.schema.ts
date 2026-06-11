import { z } from 'zod';

/** Walk-in (appointmentsiz) navbat formи. */
export const walkInSchema = z.object({
  patientId: z.string().optional(),
  serviceId: z.string().optional(),
});
export type WalkInValues = z.infer<typeof walkInSchema>;
