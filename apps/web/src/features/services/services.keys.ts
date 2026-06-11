export const serviceKeys = {
  all: ['services'] as const,
  list: () => ['services', 'list'] as const,
  detail: (id: string) => ['services', 'detail', id] as const,
  branches: () => ['branches'] as const,
};
