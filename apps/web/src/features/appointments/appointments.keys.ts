export const appointmentKeys = {
  all: ['appointments'] as const,
  list: (params: { branchId?: string; from: string; to: string }) =>
    ['appointments', 'list', params] as const,
};
