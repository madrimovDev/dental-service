import { z } from 'zod';

export const wizardSchema = z.object({
  branchId: z.string().min(1),
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  serviceIds: z.array(z.string()).default([]),
  startTime: z.date(),
  endTime: z.date(),
  notes: z.string().optional(),
});
export type WizardValues = z.infer<typeof wizardSchema>;
