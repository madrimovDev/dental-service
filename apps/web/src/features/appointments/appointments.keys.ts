export const appointmentKeys = {
  all: ['appointments'] as const,
  list: (params: { branchId?: string; from: string; to: string }) =>
    ['appointments', 'list', params] as const,
  doctors: () => ['doctors', 'list'] as const,
  branchAvailability: (params: { branchId: string; date: string }) =>
    ['appointments', 'branch-availability', params] as const,
};
