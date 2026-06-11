// @dental/db-schema — Drizzle ORM schemas (M1.1 da yaratilgan)
//
// Tenant-scoped jadvallar (RLS YOQILGAN):
//   branches, roles, role_permissions, user_assignments, audit_log
//
// Platform-level jadvallar (RLS YO'Q):
//   users, tenants, permissions, refresh_tokens, password_reset_tokens
//
// audit_log alohida: tenant_id NULLABLE (platform event'lar uchun)

export * from './tables/appointments.ts';
export * from './tables/audit-log.ts';
export * from './tables/branches.ts';
export * from './tables/cashier.ts';
export * from './tables/consent.ts';
export * from './tables/diagnoses.ts';
export * from './tables/expense-categories.ts';
export * from './tables/expenses.ts';
export * from './tables/lab-orders.ts';
export * from './tables/medical-records.ts';
export * from './tables/password-reset-tokens.ts';
export * from './tables/patient-images.ts';
export * from './tables/patient-relatives.ts';
export * from './tables/patients.ts';
export * from './tables/permissions.ts';
export * from './tables/prescriptions.ts';
export * from './tables/queue-tickets.ts';
export * from './tables/refresh-tokens.ts';
export * from './tables/role-permissions.ts';
export * from './tables/roles.ts';
export * from './tables/service-materials.ts';
export * from './tables/service-prices.ts';
export * from './tables/services.ts';
export * from './tables/stock-items.ts';
export * from './tables/stock-movements.ts';
export * from './tables/tenants.ts';
export * from './tables/tooth-charts.ts';
export * from './tables/treatment-plans.ts';
export * from './tables/treatment-stage-payments.ts';
export * from './tables/user-assignments.ts';
export * from './tables/users.ts';
export * from './tables/visit-notes.ts';
