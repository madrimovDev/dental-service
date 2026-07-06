import type { ServiceCategory } from '@dental/db-schema';
import type { ServiceCategoryDto } from './service-categories.schema.ts';

export const toServiceCategoryDto = (row: ServiceCategory): ServiceCategoryDto => ({
  id: row.id,
  tenantId: row.tenantId,
  name: row.name,
  nameRu: row.nameRu ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});
