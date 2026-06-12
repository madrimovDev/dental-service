import { listBranches, listServices } from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { stockKeys } from './stock.keys';

/** Ombor itemlari (qoldiq + lowStock). branchId ixtiyoriy filtr. */
export function useStockItems(branchId?: string) {
  return useQuery({
    queryKey: stockKeys.items(branchId ?? ''),
    queryFn: () => api.stock.items(branchId ? { branchId } : undefined),
  });
}

/** Tanlangan item bo'yicha harakat tarixi. */
export function useStockMovements(itemId: string | null) {
  return useQuery({
    queryKey: stockKeys.movements(itemId ?? ''),
    queryFn: () => api.stock.movements(itemId ?? ''),
    enabled: !!itemId,
  });
}

/** BOM (service → material) ro'yxati. serviceId ixtiyoriy filtr. */
export function useServiceMaterials(serviceId?: string) {
  return useQuery({
    queryKey: stockKeys.bom(serviceId ?? ''),
    queryFn: () => api.stock.bom(serviceId ? { serviceId } : undefined),
  });
}

/** Selektorlar uchun lookup'lar. */
export function useBranches() {
  return useQuery({ queryKey: ['branches'], queryFn: () => listBranches().then((r) => r.data) });
}

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: () => listServices().then((r) => r.data) });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.stock.createItem>[0]) => api.stock.createItem(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  });
}

export function useCreateMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.stock.createMovement>[0]) =>
      api.stock.createMovement(body),
    onSuccess: (_data, vars) => {
      // Harakat qoldiqni o'zgartiradi → item ro'yxati VA shu item harakatlari yangilanadi.
      void qc.invalidateQueries({ queryKey: stockKeys.all });
      void qc.invalidateQueries({ queryKey: stockKeys.movements(vars.itemId) });
    },
  });
}

export function useCreateBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.stock.createBom>[0]) => api.stock.createBom(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  });
}

export function useRemoveBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.stock.removeBom(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  });
}
