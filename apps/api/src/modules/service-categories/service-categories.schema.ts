import { z } from '@hono/zod-openapi';

export const createServiceCategorySchema = z.object({
  name: z.string().min(1).max(100),
  nameRu: z.string().max(100).optional(),
});
export type CreateServiceCategoryInput = z.infer<typeof createServiceCategorySchema>;

export const updateServiceCategorySchema = createServiceCategorySchema.partial();
export type UpdateServiceCategoryInput = z.infer<typeof updateServiceCategorySchema>;

export const serviceCategoryIdParamSchema = z
  .object({ id: z.uuid() })
  .openapi({ param: { name: 'id', in: 'path' } });

export const serviceCategoryDtoSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    name: z.string().openapi({ example: 'Terapevtika' }),
    nameRu: z.string().nullable().openapi({ example: 'Терапия' }),
    createdAt: z.string().openapi({ example: '2026-06-27T10:00:00.000Z' }),
    updatedAt: z.string().openapi({ example: '2026-06-27T10:00:00.000Z' }),
  })
  .openapi('ServiceCategory');
export type ServiceCategoryDto = z.infer<typeof serviceCategoryDtoSchema>;

export const serviceCategoryDeleteResultSchema = z
  .object({ deleted: z.literal(true) })
  .openapi('ServiceCategoryDeleteResult');
