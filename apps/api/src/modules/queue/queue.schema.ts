import { z } from 'zod';

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
