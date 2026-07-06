import type { ServiceCategory } from '@dental/api-client';
import type { ServiceCategoryVM } from './service-categories.types';

export const toServiceCategoryVM = (dto: ServiceCategory): ServiceCategoryVM => ({
  id: dto.id,
  name: dto.name,
  nameRu: dto.nameRu ?? null,
});
