import { z } from 'zod';

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
