// Query-key factory (RFC-0010 §3) — inline `['dashboard', ...]` key'lar bilan byte-identical.
type Q = { from: string; to: string; branchId?: string };

export const dashboardKeys = {
  all: ['dashboard'] as const,
  revenue: (q: Q) => ['dashboard', 'revenue', q] as const,
  doctorAppointments: (
    doctorId: string | undefined,
    branchId: string | null,
    range: { from: string; to: string },
  ) => ['dashboard', 'doctor-appointments', doctorId, branchId, range] as const,
  labOrders: () => ['dashboard', 'lab-orders'] as const,
  branchNames: () => ['dashboard', 'branch-names'] as const,
  doctorNames: () => ['dashboard', 'doctor-names'] as const,
  managerRevenue: (q: Q) => ['dashboard', 'manager-revenue', q] as const,
  managerAppointments: (q: Q) => ['dashboard', 'manager-appointments', q] as const,
  managerDoctors: (q: Q) => ['dashboard', 'manager-doctors', q] as const,
  managerPlans: (q: Q) => ['dashboard', 'manager-plans', q] as const,
};
