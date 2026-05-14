import { z } from 'zod';

// ===== Treatment Plans =====
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

// ===== Visit Notes =====
export const createVisitNoteSchema = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  appointmentId: z.uuid().optional(),
  visitDate: z.iso.datetime().optional(),
  subjective: z.string().max(5000).optional(),
  objective: z.string().max(5000).optional(),
  assessmentDiagnoses: z.array(z.uuid()).default([]),
  plan: z.string().max(5000).optional(),
  performedServices: z.array(z.uuid()).default([]),
  freeNotes: z.string().max(5000).optional(),
});
export type CreateVisitNoteInput = z.infer<typeof createVisitNoteSchema>;

export const updateVisitNoteSchema = createVisitNoteSchema.partial().omit({ patientId: true });
export type UpdateVisitNoteInput = z.infer<typeof updateVisitNoteSchema>;

// ===== Tooth Chart =====
const TOOTH_SURFACE = z.enum(['whole', 'M', 'D', 'B', 'L', 'O', 'I']);
const TOOTH_STATE = z.enum([
  'healthy',
  'caries',
  'filling',
  'crown',
  'implant',
  'missing',
  'root_canal',
  'to_extract',
  'temporary',
  'veneer',
]);

export const createToothChartSchema = z.object({
  patientId: z.uuid(),
  visitNoteId: z.uuid().optional(),
  isPrimaryDentition: z.boolean().default(false),
  notes: z.string().max(2000).optional(),
  states: z
    .array(
      z.object({
        toothNumber: z.coerce.number().int().min(11).max(85),
        surface: TOOTH_SURFACE.default('whole'),
        state: TOOTH_STATE,
        diagnosisId: z.uuid().optional(),
        notes: z.string().max(500).optional(),
      }),
    )
    .default([]),
});
export type CreateToothChartInput = z.infer<typeof createToothChartSchema>;
