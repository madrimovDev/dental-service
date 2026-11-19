import {
  createStockBatch,
  createStockBom,
  createStockItem,
  createStockMovement,
  listBranches,
  listExpiringStockBatches,
  listServices,
  listStockAutoDeductionsToday,
  listStockBatches,
  listStockBom,
  listStockItems,
  listStockMovements,
  removeStockBom,
  updateStockItem,
} from '@dental/api-client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { expensesKeys } from '@/features/expenses/expenses.keys';
import { lookupKeys } from '@/lib/lookup-keys';
import { stockKeys } from './stock.keys';

/** Ombor itemlari (qoldiq + lowStock). branchId ixtiyoriy filtr. */
export function useStockItems(branchId?: string) {
  return useQuery({
    queryKey: stockKeys.items(branchId ?? ''),
    queryFn: () => listStockItems(branchId ? { branchId } : undefined).then((r) => r.data),
  });
}

/** Harakatlar sahifa hajmi — API default'i (`DEFAULT_MOVEMENTS_PAGE_SIZE`) bilan bir xil. */
export const MOVEMENTS_PAGE_SIZE = 50;

/**
 * Tanlangan item bo'yicha harakat tarixi — sahifalab («Ko'proq yuklash», FX-168). Oxirgi sahifa
 * to'liq (`pageSize` ta) bo'lsa — keyingisi bor. Kalit `stockKeys.movements(id)` prefiksida
 * (harakat yaratilganda invalidate bo'ladi).
 */
export function useStockMovements(itemId: string | null) {
  return useInfiniteQuery({
    queryKey: [...stockKeys.movements(itemId ?? ''), 'paged'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      listStockMovements({
        itemId: itemId ?? '',
        page: pageParam,
        pageSize: MOVEMENTS_PAGE_SIZE,
      }).then((r) => r.data),
    getNextPageParam: (lastPage, _pages, lastParam) =>
      lastPage.length >= MOVEMENTS_PAGE_SIZE ? lastParam + 1 : undefined,
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

/** Item bo'yicha partiyalar (supplier/batch#/expiry/cost). */
export function useStockBatches(itemId: string | null) {
  return useQuery({
    queryKey: stockKeys.batches(itemId ?? ''),
    queryFn: () => listStockBatches({ itemId: itemId ?? '' }).then((r) => r.data),
    enabled: !!itemId,
  });
}

/**
 * Muddati yaqinlashayotgan (yoki o'tgan) partiyalar — faqat qoldig'i borlari (IR-02), filial
 * filtri bilan.
 */
export function useExpiringBatches(withinDays = 30, branchId?: string) {
  return useQuery({
    queryKey: stockKeys.expiring(withinDays, branchId ?? ''),
    queryFn: () =>
      listExpiringStockBatches({ withinDays, ...(branchId ? { branchId } : {}) }).then(
        (r) => r.data,
      ),
  });
}

/**
 * Bugungi avto-yechish jurnali (vizit yozuvidan).
 */
export function useAutoDeductionsToday(branchId?: string) {
  return useQuery({
    queryKey: stockKeys.autoToday(branchId ?? ''),
    queryFn: () =>
      listStockAutoDeductionsToday(branchId ? { branchId } : undefined).then((r) => r.data),
  });
}

/** Kirim body'si: `recordAsExpense` — kirimni xarajatlarga ham yozish (generated tipda hali yo'q). */
export type CreateBatchPayload = Parameters<typeof createStockBatch>[0] & {
  recordAsExpense?: boolean;
};

export function useCreateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBatchPayload) => createStockBatch(body).then((r) => r.data),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: stockKeys.all });
      // FX-166: «xarajatga yoz» kirimi xarajat yaratadi — xarajatlar/P&L keshi ham yangilanadi.
      if (vars.recordAsExpense) void qc.invalidateQueries({ queryKey: expensesKeys.all });
    },
  });
}

/** Selektorlar uchun lookup'lar. */
export function useBranches() {
  return useQuery({
    queryKey: lookupKeys.branches(),
    queryFn: () => listBranches().then((r) => r.data),
  });
}

export function useServices(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled,
    queryKey: lookupKeys.services(),
    queryFn: () => listServices().then((r) => r.data),
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof createStockItem>[0]) =>
      createStockItem(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.all }),
  });
}

/** Item metadata'sini tahrirlash (name/unit/category/price/minThreshold). Qoldiq o'zgarmaydi. */
export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateStockItem>[1] }) =>
      updateStockItem(id, body).then((r) => r.data),
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
