import {
  createStockBom,
  createStockItem,
  createStockMovement,
  listBranches,
  listServices,
  listStockBom,
  listStockItems,
  listStockMovements,
  removeStockBom,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { stockKeys } from './stock.keys';

/** Ombor itemlari (qoldiq + lowStock). branchId ixtiyoriy filtr. */
export function useStockItems(branchId?: string) {
  return useQuery({
    queryKey: stockKeys.items(branchId ?? ''),
    queryFn: () => listStockItems(branchId ? { branchId } : undefined).then((r) => r.data),
  });
}

/** Tanlangan item bo'yicha harakat tarixi. */
export function useStockMovements(itemId: string | null) {
  return useQuery({
    queryKey: stockKeys.movements(itemId ?? ''),
    queryFn: () => listStockMovements({ itemId: itemId ?? '' }).then((r) => r.data),
    enabled: !!itemId,
  });
}

/** BOM (service → material) ro'yxati. serviceId ixtiyoriy filtr. */
export function useServiceMaterials(serviceId?: string) {
  return useQuery({
    queryKey: stockKeys.bom(serviceId ?? ''),
    queryFn: () => listStockBom(serviceId ? { serviceId } : undefined).then((r) => r.data),
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
    mutationFn: (body: Parameters<typeof createStockItem>[0]) =>
      createStockItem(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  });
}

export function useCreateMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof createStockMovement>[0]) =>
      createStockMovement(body).then((r) => r.data),
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
    mutationFn: (body: Parameters<typeof createStockBom>[0]) =>
      createStockBom(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  });
}

export function useRemoveBom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeStockBom(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  });
}
