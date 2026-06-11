export const queueKeys = {
  all: ['queue'] as const,
  today: (branchId: string) => ['queue', 'today', branchId] as const,
  candidates: (branchId: string) => ['queue', 'candidates', branchId] as const,
};
