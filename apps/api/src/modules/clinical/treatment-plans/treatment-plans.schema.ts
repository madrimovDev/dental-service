import { z } from 'zod';

export const createTreatmentPlanSchema = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  title: z.string().min(2).max(200),
  notes: z.string().max(2000).optional(),
  stages: z
    .array(
      z.object({
        serviceId: z.uuid().optional(),
        serviceName: z.string().min(1).max(200),
        toothNumbers: z.array(z.coerce.number().int()).optional(),
        estimatedVisits: z.coerce.number().int().positive().default(1),
        estimatedDurationMinutes: z.coerce.number().int().positive().optional(),
        cost: z.coerce.number().nonnegative(),
        notes: z.string().max(500).optional(),
      }),
    )
    .default([]),
});
export type CreateTreatmentPlanInput = z.infer<typeof createTreatmentPlanSchema>;

export const updateTreatmentPlanSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  notes: z.string().max(2000).optional(),
  status: z
    .enum(['draft', 'presented', 'accepted', 'in_progress', 'completed', 'cancelled'])
    .optional(),
});
export type UpdateTreatmentPlanInput = z.infer<typeof updateTreatmentPlanSchema>;

export const updateStageSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped']).optional(),
  notes: z.string().max(500).optional(),
});
export type UpdateStageInput = z.infer<typeof updateStageSchema>;
