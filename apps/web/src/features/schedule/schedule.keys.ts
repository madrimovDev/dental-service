/** Schedule query-key factory (RFC-0010 §3). */
export const scheduleKeys = {
  all: ['schedule'] as const,
  workingHours: (doctorId: string, branchId?: string) =>
    ['schedule', 'working-hours', doctorId, branchId ?? null] as const,
  timeOff: (params: { doctorId?: string; branchId?: string; from?: string; to?: string }) =>
    ['schedule', 'time-off', params] as const,
  availability: (params: {
    doctorId: string;
    branchId: string;
    date: string;
    slotMinutes: number;
  }) => ['schedule', 'availability', params] as const,
};
