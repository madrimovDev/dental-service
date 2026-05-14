import { z } from 'zod';

const prescriptionItemSchema = z.object({
  medicationName: z.string().min(1).max(200),
  dosage: z.string().min(1).max(100),
  frequency: z.string().min(1).max(200),
  durationDays: z.coerce.number().int().positive().optional(),
  instructions: z.string().max(500).optional(),
});

export const createPrescriptionSchema = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  visitNoteId: z.uuid().optional(),
  issuedDate: z.iso.datetime().optional(),
  items: z.array(prescriptionItemSchema).min(1),
  diagnosis: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;

export const updatePrescriptionSchema = createPrescriptionSchema
  .partial()
  .omit({ patientId: true });
export type UpdatePrescriptionInput = z.infer<typeof updatePrescriptionSchema>;
