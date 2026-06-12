export type { ApiClient, ApiClientConfig } from './client.ts';
export { ApiError, createApiClient } from './client.ts';
export type { Endpoints } from './endpoints.ts';
export { createEndpoints } from './endpoints.ts';
export type { ListAuditLogResult } from './generated/audit/audit.ts';
// Generated (orval) — explicit re-export (coexistence: kolliziya nazorati)
export { listAuditLog } from './generated/audit/audit.ts';
export type {
  CreateBranchResult,
  DeleteBranchResult,
  GetBranchResult,
  ListBranchesResult,
  UpdateBranchResult,
} from './generated/branches/branches.ts';
export {
  createBranch,
  deleteBranch,
  getBranch,
  listBranches,
  updateBranch,
} from './generated/branches/branches.ts';
export type {
  AuditListResponse,
  AuditListResponseMeta,
  AuditLogEntry,
  AuditLogEntryAfter,
  AuditLogEntryBefore,
  Branch,
  BranchDeleteResult,
  BranchWorkHours,
  BranchWorkHoursAnyOf,
  BranchWorkHoursAnyOfTwo,
  CreateBranch201,
  CreateBranchBody,
  CreateBranchBodyWorkHours,
  CreateBranchBodyWorkHoursAnyOf,
  CreateBranchBodyWorkHoursAnyOfTwo,
  DeleteBranch200,
  GetBranch200,
  GetTenant200,
  ListAuditLog200,
  ListAuditLogParams,
  ListBranches200,
  Tenant,
  TenantSettings,
  TenantSubscriptionStatus,
  TransferTenantOwnership200,
  TransferTenantOwnershipBody,
  UpdateBranch200,
  UpdateBranchBody,
  UpdateBranchBodyWorkHours,
  UpdateBranchBodyWorkHoursAnyOf,
  UpdateBranchBodyWorkHoursAnyOfTwo,
  UpdateTenant200,
  UpdateTenantBody,
  UpdateTenantBodyDefaultLanguage,
  UpdateTenantSettings200,
  UpdateTenantSettingsBody,
} from './generated/model/index.ts';
export type {
  GetTenantResult,
  TransferTenantOwnershipResult,
  UpdateTenantResult,
} from './generated/tenant/tenant.ts';
export {
  getTenant,
  transferTenantOwnership,
  updateTenant,
} from './generated/tenant/tenant.ts';
export type {
  GetTenantSettingsResult,
  UpdateTenantSettingsResult,
} from './generated/tenant-settings/tenant-settings.ts';
export {
  getTenantSettings,
  updateTenantSettings,
} from './generated/tenant-settings/tenant-settings.ts';
export type { CustomInstanceConfig } from './mutator.ts';
export { configureClient, customInstance, isClientConfigured } from './mutator.ts';
export * from './types.ts';
export * from './types-clinical.ts';
export * from './types-erp.ts';
export * from './types-hr.ts';
export * from './types-m3.ts';
export * from './types-m5.ts';
export * from './types-notifications.ts';
export * from './types-patients.ts';
export * from './types-reports.ts';
