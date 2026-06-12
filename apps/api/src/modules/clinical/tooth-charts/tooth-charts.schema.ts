import { z } from 'zod';

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
