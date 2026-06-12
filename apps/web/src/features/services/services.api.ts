import { listBranches, type Service } from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { serviceKeys } from './services.keys';
import type { ServiceFormValues } from './services.types';

export function useServices() {
  return useQuery({ queryKey: serviceKeys.list(), queryFn: api.services.list });
}

export function useServiceDetail(id: string | null, enabled = true) {
  return useQuery({
    queryKey: serviceKeys.detail(id ?? ''),
    queryFn: () => api.services.get(id ?? ''),
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
        return api.services.update(editing.id, {
          nameUz: values.nameUz,
          nameRu: values.nameRu || null,
          category: values.category || null,
          durationMinutes: values.durationMinutes,
          requiredRole: values.requiredRole || null,
          descriptionUz: values.descriptionUz || null,
          descriptionRu: values.descriptionRu || null,
          isActive: values.isActive,
        });
      }
      return api.services.create({
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
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceKeys.all }),
  });
}

export function useSetPrice(serviceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, price }: { branchId: string; price: number }) =>
      api.services.setPrice(serviceId ?? '', { branchId, price }),
    onSuccess: () => {
      if (serviceId) void qc.invalidateQueries({ queryKey: serviceKeys.detail(serviceId) });
    },
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.services.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceKeys.all }),
  });
}
