export const payrollKeys = {
  all: ['payroll'] as const,
  runs: () => ['payroll', 'runs'] as const,
  run: (id: string) => ['payroll', 'run', id] as const,
  staffNames: () => ['payroll', 'staff-names'] as const,
};
