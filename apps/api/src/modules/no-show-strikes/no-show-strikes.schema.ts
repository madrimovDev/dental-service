import { z } from '@hono/zod-openapi';

/** Bitta strike (bemor kartasi tarixi uchun). */
export const noShowStrikeDtoSchema = z
  .object({
    id: z.uuid(),
    appointmentId: z.uuid(),
    waived: z.boolean(),
    waivedReason: z.string().nullable(),
    waivedAt: z.string().nullable(),
    createdAt: z.string(),
    appointmentStatus: z.string(),
    startTime: z.string(),
  })
  .openapi('NoShowStrike');

/** Bemor strike xulosasi — tarix + faol count + tenant chegara + flag. */
export const patientStrikesSummaryDtoSchema = z
  .object({
    strikes: z.array(noShowStrikeDtoSchema),
    activeCount: z.number().int(),
    threshold: z.number().int(),
    flagged: z.boolean(),
  })
  .openapi('PatientNoShowStrikeSummary');

/** Waive natijasi (bemor kartasi keyin summary'ni refetch qiladi). */
export const waivedStrikeDtoSchema = z
  .object({
    id: z.uuid(),
    waived: z.boolean(),
  })
  .openapi('WaivedStrike');

export const waiveStrikeSchema = z.object({
  reason: z.string().max(500).nullable().optional(),
});

export const strikePatientIdParamSchema = z.object({
  patientId: z.uuid(),
});

export const strikeIdParamSchema = z.object({
  id: z.uuid(),
});
