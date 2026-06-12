import { z } from '@hono/zod-openapi';

// ─── Enums ───────────────────────────────────────────────────────────────────

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

// ─── Input DTOs ───────────────────────────────────────────────────────────────

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

// ─── Path param ───────────────────────────────────────────────────────────────

export const patientIdParamSchema = z.object({
  patientId: z.uuid().openapi({ description: 'Patient UUID' }),
});

// ─── Response DTOs ────────────────────────────────────────────────────────────

/**
 * Tooth state entry DTO.
 * NOTE: DB `tooth_states` table has no `createdAt` column — wire shape omits it.
 */
export const toothStateEntryDtoSchema = z
  .object({
    id: z.uuid(),
    toothChartId: z.uuid(),
    toothNumber: z.number().int().openapi({ example: 16 }),
    surface: TOOTH_SURFACE.openapi({ example: 'whole' }),
    state: TOOTH_STATE.openapi({ example: 'healthy' }),
    diagnosisId: z.uuid().nullable(),
    notes: z.string().nullable(),
  })
  .openapi('ToothStateEntry');

export type ToothStateEntryDto = z.infer<typeof toothStateEntryDtoSchema>;

/** Tooth chart header (list response — no states). */
export const toothChartDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    patientId: z.uuid(),
    visitNoteId: z.uuid().nullable(),
    isPrimaryDentition: z.boolean(),
    notes: z.string().nullable(),
    createdBy: z.uuid().nullable(),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('ToothChart');

export type ToothChartDto = z.infer<typeof toothChartDtoSchema>;

/** Tooth chart with nested states (latest / create response). */
export const toothChartWithStatesDtoSchema = toothChartDtoSchema
  .extend({
    states: z.array(toothStateEntryDtoSchema),
  })
  .openapi('ToothChartWithStates');

export type ToothChartWithStatesDto = z.infer<typeof toothChartWithStatesDtoSchema>;
