import {
  ApiError,
  createServiceCategory,
  deleteServiceCategory,
  listServiceCategories,
  type ServiceCategory,
  updateServiceCategory,
} from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { serviceCategoryKeys } from './service-categories.keys';
import type { ServiceCategoryFormValues } from './service-categories.types';

export function useServiceCategories() {
  return useQuery({
    queryKey: serviceCategoryKeys.list(),
    queryFn: () => listServiceCategories().then((r) => r.data),
  });
}

export function useUpsertServiceCategory(editing: ServiceCategory | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: ServiceCategoryFormValues) => {
      const body = { name: values.name, nameRu: values.nameRu || undefined };
      return editing
        ? updateServiceCategory(editing.id, body).then((r) => r.data)
        : createServiceCategory(body).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceCategoryKeys.all }),
  });
}

export function useDeleteServiceCategory() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteServiceCategory(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceCategoryKeys.all }),
    onError: (err) => {
      const message =
        err instanceof ApiError && err.code === 'service_category.in_use'
          ? t('serviceCategories.in_use_error')
          : t('common.error');
      notifications.show({ color: 'red', message });
    },
  });
}
