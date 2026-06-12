import { z } from '@hono/zod-openapi';

/** Appointment status enum — DTO va updateAppointmentSchema da ikkala joyda ham ishlatiladi. */
export const appointmentStatusSchema = z.enum([
  'scheduled',
  'confirmed',
  'in_progress',
  'completed',
  'no_show',
  'cancelled',
]);

export const createAppointmentSchema = z.object({
  branchId: z.uuid(),
  patientId: z.uuid(),
  doctorId: z.uuid(),
  assistantId: z.uuid().optional(),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  serviceIds: z.array(z.uuid()).default([]),
  notes: z.string().max(2000).optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  startTime: z.iso.datetime().optional(),
  endTime: z.iso.datetime().optional(),
  doctorId: z.uuid().optional(),
  assistantId: z.uuid().nullable().optional(),
  status: appointmentStatusSchema.optional(),
  serviceIds: z.array(z.uuid()).optional(),
  notes: z.string().max(2000).optional(),
  cancellationReason: z.string().max(500).optional(),
});
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export const listAppointmentsQuery = z.object({
  branchId: z.uuid().optional(),
  doctorId: z.uuid().optional(),
  patientId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuery>;

/** Cancel body — body ixtiyoriy (no-body request ni qo'llab-quvvatlaydi). */
export const cancelAppointmentBodySchema = z.object({
  reason: z.string().optional(),
});

/** Path param schema — GET /{id}, PATCH /{id}, POST /{id}/cancel uchun. */
export const appointmentIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

/** Response DTO — wire shape (Date → ISO string, nullable fields nullable). */
export const appointmentDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    branchId: z.uuid(),
    patientId: z.uuid(),
    doctorId: z.uuid(),
    assistantId: z.uuid().nullable().openapi({ example: null }),
    startTime: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    endTime: z.string().openapi({ example: '2026-06-12T11:00:00.000Z' }),
    status: appointmentStatusSchema.openapi({ example: 'scheduled' }),
    serviceIds: z.array(z.uuid()).nullable().openapi({ example: null }),
    notes: z.string().nullable().openapi({ example: null }),
    cancellationReason: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('Appointment');

export type AppointmentDto = z.infer<typeof appointmentDtoSchema>;
