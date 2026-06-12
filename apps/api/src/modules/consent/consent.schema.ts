import { z } from '@hono/zod-openapi';

// ─── Shared enum ─────────────────────────────────────────────────────────────

const consentType = z.enum(['treatment', 'anesthesia', 'photo', 'data_processing', 'other']);

// ─── Request schemas (used by service — do NOT remove type exports) ──────────

export const createTemplateSchema = z.object({
  type: consentType,
  title: z.string().min(2).max(200),
  bodyUz: z.string().min(10),
  bodyRu: z.string().optional(),
  isActive: z.boolean().default(true),
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = createTemplateSchema.partial();
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const signFormSchema = z.object({
  patientId: z.uuid(),
  templateId: z.uuid().optional(),
  type: consentType,
  title: z.string().min(2).max(200),
  bodyText: z.string().min(10),
  language: z.enum(['uz', 'ru']),
  patientSignatureName: z.string().min(2).max(200).optional(),
  notes: z.string().max(1000).optional(),
});
export type SignFormInput = z.infer<typeof signFormSchema>;

// ─── Path param ───────────────────────────────────────────────────────────────

/** Path param schema for routes requiring /{id} */
export const templateIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

// ─── Query param schemas ──────────────────────────────────────────────────────

/** GET /templates — optional type filter + active flag */
export const listTemplatesQuerySchema = z.object({
  type: consentType.optional().openapi({ param: { name: 'type', in: 'query' } }),
  /** 'false' → include inactive; anything else (or absent) → active-only */
  active: z
    .string()
    .optional()
    .openapi({ param: { name: 'active', in: 'query' } }),
});

/** GET /forms — optional patientId filter */
export const listFormsQuerySchema = z.object({
  patientId: z
    .uuid()
    .optional()
    .openapi({ param: { name: 'patientId', in: 'query' } }),
});

// ─── Response DTOs ────────────────────────────────────────────────────────────

/** Wire response for a consent template. Timestamps are ISO strings. */
export const consentTemplateDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    type: consentType,
    title: z.string().openapi({ example: 'Davolash uchun rozilik' }),
    bodyUz: z.string().openapi({ example: 'Men, quyidagi bemor, ...' }),
    bodyRu: z.string().nullable().openapi({ example: null }),
    isActive: z.boolean().openapi({ example: true }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('ConsentTemplate');

export type ConsentTemplateDto = z.infer<typeof consentTemplateDtoSchema>;

/** Wire response for a signed consent form. `language` is a plain string per wire contract. */
export const consentFormDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    patientId: z.uuid(),
    templateId: z.uuid().nullable().openapi({ example: null }),
    type: consentType,
    title: z.string().openapi({ example: 'Davolash uchun rozilik' }),
    bodyText: z.string().openapi({ example: 'Matn...' }),
    language: z.string().openapi({ example: 'uz' }),
    signedAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
    signedByUserId: z.uuid(),
    patientSignatureName: z.string().nullable().openapi({ example: null }),
    notes: z.string().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-12T10:00:00.000Z' }),
  })
  .openapi('ConsentForm');

export type ConsentFormDto = z.infer<typeof consentFormDtoSchema>;
