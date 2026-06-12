import { z } from '@hono/zod-openapi';

// ─── Request schemas ─────────────────────────────────────────────────────────

export const createQueueTicketSchema = z.object({
  branchId: z.uuid(),
  patientId: z.uuid().optional(),
  serviceId: z.uuid().optional(),
  appointmentId: z.uuid().optional(),
});
export type CreateQueueTicketInput = z.infer<typeof createQueueTicketSchema>;

export const updateQueueStatusSchema = z.object({
  status: z.enum(['waiting', 'in_progress', 'done', 'missed']),
  doctorId: z.uuid().optional(),
});
export type UpdateQueueStatusInput = z.infer<typeof updateQueueStatusSchema>;

// ─── Path param schema ───────────────────────────────────────────────────────

export const queueTicketIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ─── Response DTO schemas ─────────────────────────────────────────────────────

/** Wire DTO for a queue ticket — Date fields as ISO strings. */
export const queueTicketDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    branchId: z.uuid(),
    patientId: z.uuid().nullable(),
    serviceId: z.uuid().nullable(),
    doctorId: z.uuid().nullable(),
    appointmentId: z.uuid().nullable(),
    queueNumber: z.number().int().openapi({ example: 1 }),
    ticketDate: z.string().openapi({ example: '2026-06-12T00:00:00.000Z' }),
    status: z.enum(['waiting', 'in_progress', 'done', 'missed']).openapi({ example: 'waiting' }),
    calledAt: z.string().nullable().openapi({ example: null }),
    finishedAt: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('QueueTicket');

export type QueueTicketDto = z.infer<typeof queueTicketDtoSchema>;

/** Wire DTO for a check-in candidate (appointment subset without createdBy). */
export const checkInCandidateDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    branchId: z.uuid(),
    patientId: z.uuid(),
    doctorId: z.uuid(),
    assistantId: z.uuid().nullable(),
    startTime: z.string().openapi({ example: '2026-06-12T09:00:00.000Z' }),
    endTime: z.string().openapi({ example: '2026-06-12T09:30:00.000Z' }),
    status: z
      .enum(['scheduled', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled'])
      .openapi({ example: 'scheduled' }),
    serviceIds: z.array(z.uuid()).nullable(),
    notes: z.string().nullable(),
    cancellationReason: z.string().nullable(),
    createdAt: z.string().openapi({ example: '2026-06-12T08:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T08:00:00.000Z' }),
  })
  .openapi('CheckInCandidate');

export type CheckInCandidateDto = z.infer<typeof checkInCandidateDtoSchema>;
