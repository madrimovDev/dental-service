import { z } from '@hono/zod-openapi';

// ─── Enums (recalls jadval enum'lariga mos) ─────────────────────────────────

export const recallReasonSchema = z.enum([
  'preventive',
  'treatment_followup',
  'post_op_check',
  'manual',
]);
export const recallStatusSchema = z.enum([
  'pending',
  'contacted',
  'scheduled',
  'completed',
  'dismissed',
]);
export const recallSourceSchema = z.enum(['treatment_stage', 'appointment', 'manual', 'scheduler']);

// ─── Response DTO ────────────────────────────────────────────────────────────

export const recallDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    branchId: z.uuid().nullable().openapi({ example: null }),
    patientId: z.uuid(),
    /** Bemor nomi/telefoni — dashboard ko'rinishi uchun join (PII). */
    patientName: z.string().openapi({ example: 'Aliyev Vali' }),
    patientPhone: z.string().nullable().openapi({ example: '+998901234567' }),
    reason: recallReasonSchema.openapi({ example: 'preventive' }),
    status: recallStatusSchema.openapi({ example: 'pending' }),
    source: recallSourceSchema.openapi({ example: 'scheduler' }),
    /** "YYYY-MM-DD" (date ustun — instant emas, passthrough). */
    dueDate: z.string().openapi({ example: '2026-12-21' }),
    intervalMonths: z.number().int().nullable().openapi({ example: 6 }),
    sourceStageId: z.uuid().nullable().openapi({ example: null }),
    treatmentPlanId: z.uuid().nullable().openapi({ example: null }),
    scheduledAppointmentId: z.uuid().nullable().openapi({ example: null }),
    assignedDoctorId: z.uuid().nullable().openapi({ example: null }),
    lastContactedAt: z.string().nullable().openapi({ example: null }),
    contactAttempts: z.number().int().openapi({ example: 0 }),
    notes: z.string().nullable().openapi({ example: null }),
    createdBy: z.uuid().nullable().openapi({ example: null }),
    closedBy: z.uuid().nullable().openapi({ example: null }),
    closedAt: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-21T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-21T10:00:00.000Z' }),
  })
  .openapi('RecallDto');
export type RecallDto = z.infer<typeof recallDtoSchema>;

// ─── Query (dashboard list) ─────────────────────────────────────────────────

export const listRecallsQuerySchema = z.object({
  /** "YYYY-MM-DD" — bu kun (yoki undan oldin) due bo'lganlar (`<=`). */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format kutilgan')
    .optional()
    .openapi({ example: '2026-06-21' }),
  status: recallStatusSchema.optional(),
  branchId: z.uuid().optional(),
});
export type ListRecallsQuery = z.infer<typeof listRecallsQuerySchema>;

// ─── Path params ────────────────────────────────────────────────────────────

export const recallIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

export const patientIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ─── Request bodies ──────────────────────────────────────────────────────────

export const createRecallSchema = z
  .object({
    patientId: z.uuid(),
    branchId: z.uuid().nullable().optional(),
    reason: recallReasonSchema.default('manual'),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD format kutilgan'),
    intervalMonths: z.number().int().min(1).max(120).nullable().optional(),
    treatmentPlanId: z.uuid().nullable().optional(),
    assignedDoctorId: z.uuid().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .openapi('CreateRecall');
export type CreateRecallInput = z.infer<typeof createRecallSchema>;

export const updateRecallSchema = z
  .object({
    status: recallStatusSchema.optional(),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    branchId: z.uuid().nullable().optional(),
    assignedDoctorId: z.uuid().nullable().optional(),
    scheduledAppointmentId: z.uuid().nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
  })
  .openapi('UpdateRecall');
export type UpdateRecallInput = z.infer<typeof updateRecallSchema>;

/** Mark-contacted body — ixtiyoriy izoh (qo'lda chaqirish, SMS'siz). */
export const markContactedSchema = z
  .object({ notes: z.string().max(1000).nullable().optional() })
  .openapi('MarkRecallContacted');
export type MarkContactedInput = z.infer<typeof markContactedSchema>;
