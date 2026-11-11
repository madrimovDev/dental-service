import { z } from '@hono/zod-openapi';

const pendingItemSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  patientName: z.string(),
  at: z.string(),
});

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
  })
  .openapi('DoctorPending');
export type DoctorPendingDto = z.infer<typeof doctorPendingDtoSchema>;
