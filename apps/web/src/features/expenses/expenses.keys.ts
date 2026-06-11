export const expensesKeys = {
  all: ['expenses'] as const,
  list: (params: Record<string, unknown>) => ['expenses', 'list', params] as const,
  categories: () => ['expenses', 'categories'] as const,
  summary: (range: { from: string; to: string; branchId?: string }) =>
    ['expenses', 'summary', range] as const,
};
