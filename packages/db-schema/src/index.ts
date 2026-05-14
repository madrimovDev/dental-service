// @dental/db-schema — Drizzle ORM schemas (M1.1 da yaratilgan)
//
// Tenant-scoped jadvallar (RLS YOQILGAN):
//   branches, roles, role_permissions, user_assignments, audit_log
//
// Platform-level jadvallar (RLS YO'Q):
//   users, tenants, permissions, refresh_tokens, password_reset_tokens
//
// audit_log alohida: tenant_id NULLABLE (platform event'lar uchun)

export * from './tables/audit-log.ts';
export * from './tables/branches.ts';
export * from './tables/medical-records.ts';
export * from './tables/password-reset-tokens.ts';
export * from './tables/patients.ts';
export * from './tables/permissions.ts';
export * from './tables/refresh-tokens.ts';
export * from './tables/role-permissions.ts';
export * from './tables/roles.ts';
export * from './tables/tenants.ts';
export * from './tables/user-assignments.ts';
export * from './tables/users.ts';
