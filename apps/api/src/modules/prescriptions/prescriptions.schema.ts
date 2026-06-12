import { z } from '@hono/zod-openapi';

/** Prescription item — `items[]` JSONB array elementi. */
export const prescriptionItemDtoSchema = z
  .object({
    medicationName: z.string().openapi({ example: 'Amoxicillin' }),
    dosage: z.string().openapi({ example: '500mg' }),
    frequency: z.string().openapi({ example: '3 mahal, kuniga 3 marta' }),
    durationDays: z.number().int().positive().optional().openapi({ example: 7 }),
    instructions: z.string().optional().openapi({ example: 'Ovqatdan keyin' }),
  })
  .openapi('PrescriptionItem');

export type PrescriptionItemDto = z.infer<typeof prescriptionItemDtoSchema>;

/** Response DTO — wire shape (timestamps ISO string, nullable fields nullable). */
export const prescriptionDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    patientId: z.uuid(),
    doctorId: z.uuid(),
    visitNoteId: z.uuid().nullable().openapi({ example: null }),
    issuedDate: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    items: z.array(prescriptionItemDtoSchema),
    diagnosis: z.string().nullable().openapi({ example: null }),
    notes: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('Prescription');

export type PrescriptionDto = z.infer<typeof prescriptionDtoSchema>;

/** Path param schema for routes requiring :id */
export const prescriptionIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

/** Query params for list endpoint — optional patientId filter. */
export const listPrescriptionsQuerySchema = z.object({
  patientId: z.uuid().optional(),
});

export type ListPrescriptionsQuery = z.infer<typeof listPrescriptionsQuerySchema>;

/** DELETE response DTO */
export const prescriptionDeleteResultSchema = z
  .object({ deleted: z.literal(true) })
  .openapi('PrescriptionDeleteResult');

/** Request input schema — create */
const prescriptionItemInputSchema = z.object({
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
  items: z.array(prescriptionItemInputSchema).min(1),
  diagnosis: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;

export const updatePrescriptionSchema = createPrescriptionSchema
  .partial()
  .omit({ patientId: true });

export type UpdatePrescriptionInput = z.infer<typeof updatePrescriptionSchema>;
