import { z } from '@hono/zod-openapi';

/**
 * CLI-488: tooth_state enum qiymatlari (packages/db-schema `toothStateEnum` bilan bir xil).
 * treatment_stages.resulting_tooth_state uchun — bosqich completed bo'lganda odontogram
 * shu holatga o'tadi.
 */
const toothStateValues = [
  'healthy',
  'caries',
  'filling',
  'crown',
  'implant',
  'missing',
  'root_canal',
  'to_extract',
  'temporary',
  'veneer',
] as const;
export const toothStateSchema = z.enum(toothStateValues);

// ─── Request schemas ──────────────────────────────────────────────────────────

export const createTreatmentPlanSchema = z.object({
  patientId: z.uuid(),
  doctorId: z.uuid(),
  title: z.string().min(2).max(200),
  notes: z.string().max(2000).optional(),
  stages: z
    .array(
      z.object({
        serviceId: z.uuid().optional(),
        serviceName: z.string().min(1).max(200),
        toothNumbers: z.array(z.coerce.number().int()).optional(),
        estimatedVisits: z.coerce.number().int().positive().default(1),
        estimatedDurationMinutes: z.coerce.number().int().positive().optional(),
        cost: z.coerce.number().nonnegative(),
        notes: z.string().max(500).optional(),
      }),
    )
    .default([]),
});
export type CreateTreatmentPlanInput = z.infer<typeof createTreatmentPlanSchema>;

export const updateTreatmentPlanSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  notes: z.string().max(2000).optional(),
  status: z
    .enum(['draft', 'presented', 'accepted', 'in_progress', 'completed', 'cancelled'])
    .optional(),
});
export type UpdateTreatmentPlanInput = z.infer<typeof updateTreatmentPlanSchema>;

export const updateStageSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped']).optional(),
  // Qaror #25: acceptance — ALOHIDA o'q (status'dan mustaqil). Qarz faqat 'accepted'.
  acceptance: z.enum(['proposed', 'accepted', 'rejected']).optional(),
  notes: z.string().max(500).optional(),
  // CLI-487: bosqichga lab-order bog'lash (`null` → uzish). Bog'langan lab-order
  // 'delivered' bo'lmasa bosqich 'completed' bo'la olmaydi (service gate).
  labOrderId: z.uuid().nullable().optional(),
  // CLI-488: bosqich 'completed' bo'lganda odontogram shu holatga o'tadi (`null` → o'tmaydi).
  resultingToothState: toothStateSchema.nullable().optional(),
});
export type UpdateStageInput = z.infer<typeof updateStageSchema>;

/**
 * CLI-461 — plan consent linkage ("to'liq bog'lash"): presented→accepted uchun
 * bo'sh/ixtiyoriy payload YETARLI EMAS — `consent` moduli orqali OLDINDAN
 * imzolangan, HAQIQIY `consent_forms` yozuvi ID'si talab etiladi. Server bu
 * yozuvni (shu bemor + 'treatment' turi + isPerpetual=true YOKI expiresAt>now)
 * tasdiqlaydi — aks holda `plan.consent_invalid` (400).
 */
export const consentSchema = z.object({
  consentFormId: z.uuid().openapi({
    description:
      "Mavjud, amaldagi consent_forms yozuvi ID'si (avval `consent` moduli — POST " +
      "/consent/forms — orqali imzolangan bo'lishi kerak).",
  }),
});
export type ConsentInput = z.infer<typeof consentSchema>;

// ─── Path param schemas ───────────────────────────────────────────────────────

export const planIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

export const stageIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ─── Query schemas ────────────────────────────────────────────────────────────

export const listPlansQuerySchema = z.object({
  patientId: z.uuid().optional().openapi({ description: 'Filter by patient UUID' }),
  // DS7: tenant-wide ro'yxat uchun status filtri (ixtiyoriy) + pagination.
  status: z
    .enum(['draft', 'presented', 'accepted', 'in_progress', 'completed', 'cancelled'])
    .optional()
    .openapi({ description: 'Filter by plan status' }),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListPlansQuery = z.infer<typeof listPlansQuerySchema>;

// ─── Response DTOs ────────────────────────────────────────────────────────────

/** Stage status enum values */
export const treatmentStageStatusEnum = z.enum(['pending', 'in_progress', 'completed', 'skipped']);

/** Stage acceptance enum values (Qaror #25 — debt axis) */
export const treatmentStageAcceptanceEnum = z.enum(['proposed', 'accepted', 'rejected']);

/** Plan status enum values */
export const treatmentPlanStatusEnum = z.enum([
  'draft',
  'presented',
  'accepted',
  'in_progress',
  'completed',
  'cancelled',
]);

/** TreatmentStage DTO — wire shape (DB columns; no createdAt on treatment_stages table). */
export const treatmentStageDtoSchema = z
  .object({
    id: z.uuid(),
    treatmentPlanId: z.uuid(),
    sequence: z.number().int().openapi({ example: 1 }),
    serviceId: z.uuid().nullable().openapi({ example: null }),
    serviceName: z.string().openapi({ example: 'Kariyes davolash' }),
    toothNumbers: z
      .array(z.number().int())
      .nullable()
      .openapi({ example: [11, 12] }),
    estimatedVisits: z.number().int().openapi({ example: 1 }),
    estimatedDurationMinutes: z.number().int().nullable().openapi({ example: 30 }),
    cost: z.string().openapi({ example: '150000.00' }),
    status: treatmentStageStatusEnum.openapi({ example: 'pending' }),
    acceptance: treatmentStageAcceptanceEnum.openapi({ example: 'proposed' }),
    notes: z.string().nullable().openapi({ example: null }),
    completedAt: z.string().nullable().openapi({ example: null }),
    // CLI-487/488: bosqichga bog'langan lab-order + completed'da o'tadigan tish holati.
    labOrderId: z.uuid().nullable().openapi({ example: null }),
    resultingToothState: toothStateSchema.nullable().openapi({ example: null }),
  })
  .openapi('TreatmentStage');

export type TreatmentStageDto = z.infer<typeof treatmentStageDtoSchema>;

/** TreatmentPlan DTO — wire shape (api-client TreatmentPlan invariant). */
export const treatmentPlanDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    patientId: z.uuid(),
    doctorId: z.uuid(),
    title: z.string().openapi({ example: 'Kompleks davolash' }),
    status: treatmentPlanStatusEnum.openapi({ example: 'draft' }),
    totalCost: z.string().openapi({ example: '450000.00' }),
    totalVisits: z.number().int().openapi({ example: 3 }),
    // CLI-461: eski ustunlar backward-compat cache sifatida saqlanadi (gate mantig'ida
    // MUSTAQIL ishlatilmaydi — haqiqiy manba `consentFormId`).
    consentSignedAt: z.string().nullable().openapi({ example: null }),
    consentSignatureUrl: z.string().nullable().openapi({ example: null }),
    /** CLI-461 — "to'liq bog'lash": planni accept qilishni asoslovchi haqiqiy consent_forms yozuvi. */
    consentFormId: z.uuid().nullable().openapi({ example: null }),
    notes: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('TreatmentPlan');

export type TreatmentPlanDto = z.infer<typeof treatmentPlanDtoSchema>;

/** TreatmentPlanWithStages DTO — plan + nested stages array. */
export const treatmentPlanWithStagesDtoSchema = treatmentPlanDtoSchema
  .extend({
    stages: z.array(treatmentStageDtoSchema),
  })
  .openapi('TreatmentPlanWithStages');

export type TreatmentPlanWithStagesDto = z.infer<typeof treatmentPlanWithStagesDtoSchema>;

/** DS7 — paginated tenant-wide list response (`{ data, meta }` inside `ok()` envelope). */
export const treatmentPlanListResponseDtoSchema = z
  .object({
    data: z.array(treatmentPlanWithStagesDtoSchema),
    meta: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  })
  .openapi('TreatmentPlanListResponse');
export type TreatmentPlanListResponseDto = z.infer<typeof treatmentPlanListResponseDtoSchema>;

// ─── C6 (CLI-223) — estimate breakdown (RFC-0005 style; C4 predikatiga mos) ──────

/** Per-stage estimate satri (money number — billing pure fn ISTISNOSI). */
export const estimateStageDtoSchema = z
  .object({
    stageId: z.uuid(),
    serviceName: z.string(),
    cost: z.number().openapi({ example: 150000, description: 'Stage list cost (xom)' }),
    status: treatmentStageStatusEnum,
    acceptance: treatmentStageAcceptanceEnum,
    paid: z.number().openapi({ example: 0 }),
    /** C4: bu bosqich qarz cost'iga kiradimi (acceptance='accepted' ∧ status≠'skipped' ∧ plan debt-status). */
    debtEligible: z.boolean(),
  })
  .openapi('TreatmentPlanEstimateStage');
export type EstimateStageDto = z.infer<typeof estimateStageDtoSchema>;

/**
 * Plan estimate — RFC-0005 uslubidagi smeta. `proposed` = qabul kutilayotgan cost,
 * `accepted` = qarzga loyiq cost (C4 predikati), `paid` = allocation yig'indisi,
 * `balance` = accepted − paid (manfiy = kredit).
 */
export const treatmentPlanEstimateDtoSchema = z
  .object({
    planId: z.uuid(),
    status: treatmentPlanStatusEnum,
    /** Σ cost — acceptance='proposed' bosqichlar (hali qabul qilinmagan). */
    totalProposed: z.number().openapi({ example: 50000 }),
    /** Σ cost — C4 qarz predikatiga loyiq (debtEligible) bosqichlar. */
    totalAccepted: z.number().openapi({ example: 200000 }),
    /** Σ cost — barcha bosqichlar (xom, filtrlanmagan). */
    totalCost: z.number().openapi({ example: 320000 }),
    /** Σ allocation (filtrlanmaydi). */
    totalPaid: z.number().openapi({ example: 220000 }),
    /** totalAccepted − totalPaid (manfiy = kredit). */
    balance: z.number().openapi({ example: -20000 }),
    stages: z.array(estimateStageDtoSchema),
  })
  .openapi('TreatmentPlanEstimate');
export type TreatmentPlanEstimateDto = z.infer<typeof treatmentPlanEstimateDtoSchema>;
