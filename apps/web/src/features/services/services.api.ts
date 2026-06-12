import {
  createService,
  deleteService,
  getService,
  listBranches,
  listServices,
  type Service,
  setServicePrice,
  updateService,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { serviceKeys } from './services.keys';
import type { ServiceFormValues } from './services.types';

export function useServices() {
  return useQuery({
    queryKey: serviceKeys.list(),
    queryFn: () => listServices().then((r) => r.data),
  });
}

export function useServiceDetail(id: string | null, enabled = true) {
  return useQuery({
    queryKey: serviceKeys.detail(id ?? ''),
    queryFn: () => getService(id ?? '').then((r) => r.data),
    enabled: !!id && enabled,
  });
}

export function useBranches() {
  return useQuery({
    queryKey: serviceKeys.branches(),
    queryFn: () => listBranches().then((r) => r.data),
  });
}

/** Create yoki update (editing bo'lsa update). */
export function useUpsertService(editing: Service | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: ServiceFormValues) => {
      if (editing) {
        return updateService(editing.id, {
          nameUz: values.nameUz,
          nameRu: values.nameRu || undefined,
          category: values.category || undefined,
          durationMinutes: values.durationMinutes,
          requiredRole: values.requiredRole || undefined,
          descriptionUz: values.descriptionUz || undefined,
          descriptionRu: values.descriptionRu || undefined,
          isActive: values.isActive,
        }).then((r) => r.data);
      }
      return createService({
        code: values.code,
        nameUz: values.nameUz,
        nameRu: values.nameRu || undefined,
        category: values.category || undefined,
        durationMinutes: values.durationMinutes,
        requiredRole: values.requiredRole || undefined,
        descriptionUz: values.descriptionUz || undefined,
        descriptionRu: values.descriptionRu || undefined,
        isActive: values.isActive,
        initialBranchId: values.initialBranchId || undefined,
        initialPrice: values.initialPrice,
      }).then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceKeys.all }),
  });
}

export function useSetPrice(serviceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, price }: { branchId: string; price: number }) =>
      setServicePrice(serviceId ?? '', { branchId, price }).then((r) => r.data),
    onSuccess: () => {
      if (serviceId) void qc.invalidateQueries({ queryKey: serviceKeys.detail(serviceId) });
    },
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteService(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceKeys.all }),
  });
}
