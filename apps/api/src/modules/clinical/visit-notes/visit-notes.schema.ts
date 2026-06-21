import { z } from '@hono/zod-openapi';

export const createVisitNoteSchema = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  appointmentId: z.uuid().optional(),
  // C5 (CLI-222): vizitni davolash bosqichiga bog'lash. Berilsa → o'sha bosqich
  // status='completed' (C2 guard'ga bo'ysunadi: skipped→completed RAD).
  stageId: z.uuid().optional(),
  visitDate: z.iso.datetime().optional().openapi({ example: '2026-06-12T10:00:00.000Z' }),
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

/** Response DTO — wire shape (api-client VisitNote invariant). */
export const visitNoteDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    patientId: z.uuid(),
    doctorId: z.uuid(),
    appointmentId: z.uuid().nullable().openapi({ example: null }),
    stageId: z.uuid().nullable().openapi({ example: null }),
    visitDate: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    subjective: z.string().nullable().openapi({ example: null }),
    objective: z.string().nullable().openapi({ example: null }),
    assessmentDiagnoses: z.array(z.uuid()).nullable().openapi({ example: [] }),
    plan: z.string().nullable().openapi({ example: null }),
    performedServices: z.array(z.uuid()).nullable().openapi({ example: [] }),
    freeNotes: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('VisitNote');

export type VisitNoteDto = z.infer<typeof visitNoteDtoSchema>;
