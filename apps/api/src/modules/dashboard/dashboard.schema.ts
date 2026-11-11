import { z } from '@hono/zod-openapi';

const pendingItemSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  patientName: z.string(),
  at: z.string(),
});

const nextPatientSchema = z
  .object({
    appointmentId: z.string(),
    patientId: z.string(),
    patientName: z.string(),
    startTime: z.string(),
    dateOfBirth: z.string().nullable(),
    /** Navbatda kutayotgan bo'lsa (queue `waiting`) — necha daqiqa; aks holda null. */
    waitingMinutes: z.number().nullable(),
    queueTicketId: z.string().nullable(),
    allergies: z.array(z.object({ substance: z.string(), severity: z.string() })),
    /** Faqat `lab_order.view` bor bo'lsa; aks holda null. */
    lab: z
      .object({
        orderType: z.string(),
        labName: z.string(),
        status: z.string(),
        detail: z.string().nullable(),
        at: z.string(),
      })
      .nullable(),
    lastVisit: z.object({ date: z.string(), summary: z.string().nullable() }).nullable(),
  })
  .nullable();

/**
 * «Mendan kutilmoqda» agregati (UI-D1) — faqat joriy shifokorniki.
 * Har blok: umumiy `count` + eng so'nggi/eng eski 5 tagacha `items`.
 */
export const doctorPendingDtoSchema = z
  .object({
    unsignedVisitNotes: z.object({ count: z.number(), items: z.array(pendingItemSchema) }),
    unreviewedImages: z.object({ count: z.number(), items: z.array(pendingItemSchema) }),
    plansAwaitingResponse: z.object({
      count: z.number(),
      oldestDays: z.number().nullable(),
      items: z.array(pendingItemSchema),
    }),
    nextPatient: nextPatientSchema,
  })
  .openapi('DoctorPending');
export type DoctorPendingDto = z.infer<typeof doctorPendingDtoSchema>;
