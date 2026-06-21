import { z } from 'zod';

export const wizardSchema = z.object({
  branchId: z.string().min(1),
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  serviceIds: z.array(z.string()).default([]),
  date: z.date(),
  /** Tanlangan bo'sh slot (ISO instant juftligi); slot tanlanmaguncha null. */
  startTime: z.string().nullable().default(null),
  endTime: z.string().nullable().default(null),
  notes: z.string().optional(),
});
export type WizardValues = z.infer<typeof wizardSchema>;
