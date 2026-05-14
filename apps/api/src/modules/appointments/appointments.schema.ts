import { z } from 'zod';

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
  status: z
    .enum(['scheduled', 'confirmed', 'in_progress', 'completed', 'no_show', 'cancelled'])
    .optional(),
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
