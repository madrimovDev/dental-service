export const cashierKeys = {
  all: ['cashier'] as const,
  today: (branchId: string) => ['cashier', 'today', branchId] as const,
  summary: (branchId: string) => ['cashier', 'summary', branchId] as const,
  planBalance: (planId: string) => ['cashier', 'plan-balance', planId] as const,
  // Kassa-lokal namespace (clinical `['clinical','plans']` dan alohida). `plans` —
  // invalidatsiya ildizi, `patientPlans` — bemor bo'yicha ro'yxat.
  plans: ['treatment-plans'] as const,
  patientPlans: (patientId: string) => ['treatment-plans', 'by-patient', patientId] as const,
};
