export const cashierKeys = {
  all: ['cashier'] as const,
  today: (branchId: string) => ['cashier', 'today', branchId] as const,
  summary: (branchId: string) => ['cashier', 'summary', branchId] as const,
  planBalance: (planId: string) => ['cashier', 'plan-balance', planId] as const,
};
