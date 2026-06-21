import { z } from '@hono/zod-openapi';

/** SOAP template body — db `$type` ga mos (3 maydon, ixtiyoriy). */
const templateBodySchema = z.object({
  subjective: z.string().max(5000).optional(),
  objective: z.string().max(5000).optional(),
  plan: z.string().max(5000).optional(),
});

export const createVisitNoteTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  template: templateBodySchema.default({}),
  isShared: z.boolean().default(false),
});
export type CreateVisitNoteTemplateInput = z.infer<typeof createVisitNoteTemplateSchema>;

export const updateVisitNoteTemplateSchema = createVisitNoteTemplateSchema.partial();
export type UpdateVisitNoteTemplateInput = z.infer<typeof updateVisitNoteTemplateSchema>;

/** Response DTO — wire shape. */
export const visitNoteTemplateDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    name: z.string(),
    category: z.string().nullable().openapi({ example: null }),
    template: templateBodySchema.openapi({ example: { subjective: 'Bemor shikoyati' } }),
    isShared: z.boolean(),
    createdBy: z.uuid().nullable().openapi({ example: null }),
    createdAt: z.string().openapi({ example: '2026-06-21T10:00:00.000Z' }),
  })
  .openapi('VisitNoteTemplate');
export type VisitNoteTemplateDto = z.infer<typeof visitNoteTemplateDtoSchema>;

export const visitNoteTemplateDeleteResultSchema = z
  .object({ deleted: z.literal(true) })
  .openapi('VisitNoteTemplateDeleteResult');
