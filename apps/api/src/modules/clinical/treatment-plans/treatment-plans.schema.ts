import { z } from '@hono/zod-openapi';

// ─── Request schemas ──────────────────────────────────────────────────────────

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

// ─── Path param schemas ───────────────────────────────────────────────────────

export const planIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

export const stageIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ─── Query schemas ────────────────────────────────────────────────────────────

export const listPlansQuerySchema = z.object({
  patientId: z.uuid().optional().openapi({ description: 'Filter by patient UUID' }),
});

// ─── Response DTOs ────────────────────────────────────────────────────────────

/** Stage status enum values */
export const treatmentStageStatusEnum = z.enum(['pending', 'in_progress', 'completed', 'skipped']);

/** Plan status enum values */
export const treatmentPlanStatusEnum = z.enum([
  'draft',
  'presented',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
]);

/** TreatmentStage DTO — wire shape (DB columns; no createdAt on treatment_stages table). */
export const treatmentStageDtoSchema = z
  .object({
    id: z.uuid(),
    treatmentPlanId: z.uuid(),
    sequence: z.number().int().openapi({ example: 1 }),
    serviceId: z.uuid().nullable().openapi({ example: null }),
    serviceName: z.string().openapi({ example: 'Kariyes davolash' }),
    toothNumbers: z
      .array(z.number().int())
      .nullable()
      .openapi({ example: [11, 12] }),
    estimatedVisits: z.number().int().openapi({ example: 1 }),
    estimatedDurationMinutes: z.number().int().nullable().openapi({ example: 30 }),
    cost: z.string().openapi({ example: '150000.00' }),
    status: treatmentStageStatusEnum.openapi({ example: 'pending' }),
    notes: z.string().nullable().openapi({ example: null }),
    completedAt: z.string().nullable().openapi({ example: null }),
  })
  .openapi('TreatmentStage');

export type TreatmentStageDto = z.infer<typeof treatmentStageDtoSchema>;

/** TreatmentPlan DTO — wire shape (api-client TreatmentPlan invariant). */
export const treatmentPlanDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    patientId: z.uuid(),
    doctorId: z.uuid(),
    title: z.string().openapi({ example: 'Kompleks davolash' }),
    status: treatmentPlanStatusEnum.openapi({ example: 'draft' }),
    totalCost: z.string().openapi({ example: '450000.00' }),
    totalVisits: z.number().int().openapi({ example: 3 }),
    notes: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('TreatmentPlan');

export type TreatmentPlanDto = z.infer<typeof treatmentPlanDtoSchema>;

/** TreatmentPlanWithStages DTO — plan + nested stages array. */
export const treatmentPlanWithStagesDtoSchema = treatmentPlanDtoSchema
  .extend({
    stages: z.array(treatmentStageDtoSchema),
  })
  .openapi('TreatmentPlanWithStages');

export type TreatmentPlanWithStagesDto = z.infer<typeof treatmentPlanWithStagesDtoSchema>;
