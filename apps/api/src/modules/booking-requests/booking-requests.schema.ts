import { z } from '@hono/zod-openapi';

export const bookingRequestStatusSchema = z.enum(['pending', 'confirmed', 'declined', 'expired']);

export const listBookingRequestsQuery = z.object({
  status: bookingRequestStatusSchema.default('pending'),
});
export type ListBookingRequestsQuery = z.infer<typeof listBookingRequestsQuery>;

export const bookingRequestDtoSchema = z
  .object({
    id: z.uuid(),
    status: bookingRequestStatusSchema,
    requestedStart: z.string(),
    createdAt: z.string(),
    branchId: z.uuid(),
    branchName: z.string().nullable(),
    patientId: z.uuid(),
    patientName: z.string().nullable(),
    doctorId: z.uuid().nullable(),
    doctorName: z.string().nullable(),
    rescheduleOfAppointmentId: z.uuid().nullable(),
    appointmentId: z.uuid().nullable(),
    declineReason: z.string().nullable(),
  })
  .openapi('BookingRequest');
export type BookingRequestDto = z.infer<typeof bookingRequestDtoSchema>;

export const bookingRequestListSchema = z
  .object({
    items: z.array(bookingRequestDtoSchema),
    pendingCount: z.number().int(),
  })
  .openapi('BookingRequestList');

export const bookingRequestIdParamSchema = z.object({ id: z.uuid() });

export const confirmBookingRequestSchema = z.object({
  /** So'rovda shifokor bo'lmasa (yoki almashtirish kerak bo'lsa). */
  doctorId: z.uuid().optional(),
});

export const declineBookingRequestSchema = z.object({
  reason: z.string().trim().min(1).max(300),
});

export const bookingRequestDecisionSchema = z
  .object({
    id: z.uuid(),
    status: bookingRequestStatusSchema,
    appointmentId: z.uuid().nullable(),
  })
  .openapi('BookingRequestDecision');
