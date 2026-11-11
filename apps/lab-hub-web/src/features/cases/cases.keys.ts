export const caseKeys = {
  all: ['cases'] as const,
  list: (p: Record<string, string | undefined>) => ['cases', 'list', p] as const,
  summary: ['cases', 'summary'] as const,
  detail: (id: string) => ['cases', 'detail', id] as const,
  users: ['lab-users'] as const,
  prices: ['price-list'] as const,
};
