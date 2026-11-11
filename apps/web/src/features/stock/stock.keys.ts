export const stockKeys = {
  all: ['stock'] as const,
  items: (branchId: string) => ['stock', 'items', branchId] as const,
  movements: (itemId: string) => ['stock', 'movements', itemId] as const,
  bom: (serviceId: string) => ['stock', 'bom', serviceId] as const,
  batches: (itemId: string) => ['stock', 'batches', itemId] as const,
  expiring: (withinDays: number, branchId = '') =>
    ['stock', 'expiring', withinDays, branchId] as const,
  autoToday: (branchId = '') => ['stock', 'auto-today', branchId] as const,
};
