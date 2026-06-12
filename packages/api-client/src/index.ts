export type { ApiClient, ApiClientConfig } from './client.ts';
export { ApiError, createApiClient } from './client.ts';
export type { Endpoints } from './endpoints.ts';
export { createEndpoints } from './endpoints.ts';
// Generated (orval) — appointments
export type {
  CancelAppointmentResult,
  CreateAppointmentResult,
  GetAppointmentResult,
  ListAppointmentsResult,
  UpdateAppointmentResult,
} from './generated/appointments/appointments.ts';
export {
  cancelAppointment,
  createAppointment,
  getAppointment,
  listAppointments,
  updateAppointment,
} from './generated/appointments/appointments.ts';
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
// Generated (orval) — diagnoses
export type { ListDiagnosesResult } from './generated/diagnoses/diagnoses.ts';
export { listDiagnoses } from './generated/diagnoses/diagnoses.ts';
// Generated model types — appointments, services, queue, notifications
// QueueTicketStatus re-exported under both names for backward compatibility
export type {
  Appointment,
  AppointmentStatus,
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
  CancelAppointment200,
  CancelAppointmentBody,
  CheckInCandidate,
  CheckInCandidateStatus,
  CreateAppointment201,
  CreateAppointmentBody,
  CreateBranch201,
  CreateBranchBody,
  CreateBranchBodyWorkHours,
  CreateBranchBodyWorkHoursAnyOf,
  CreateBranchBodyWorkHoursAnyOfTwo,
  CreateQueueTicket201,
  CreateQueueTicketBody,
  CreateService201,
  CreateServiceBody,
  DeleteBranch200,
  DeleteService200,
  Diagnosis,
  GetAppointment200,
  GetBranch200,
  GetCheckInCandidates200,
  GetCheckInCandidatesParams,
  GetQueueToday200,
  GetQueueTodayParams,
  GetService200,
  GetTenant200,
  ListAppointments200,
  ListAppointmentsParams,
  ListAuditLog200,
  ListAuditLogParams,
  ListBranches200,
  ListDiagnoses200,
  ListDiagnosesParams,
  ListNotifications200,
  ListNotificationsParams,
  ListPermissions200,
  ListServices200,
  MarkAllNotificationsRead200,
  MarkNotificationRead200,
  Notification,
  NotificationMarkAllReadResult,
  NotificationMarkReadResult,
  NotificationsFeed,
  NotificationsFeedMeta,
  PermissionDef,
  QueueTicket,
  QueueTicketStatus,
  QueueTicketStatus as QueueStatus,
  Service,
  ServiceDeleteResult,
  ServicePrice,
  ServiceWithPrices,
  ServiceWithPricesAllOf,
  SetServicePrice201,
  SetServicePriceBody,
  Tenant,
  TenantSettings,
  TenantSubscriptionStatus,
  TransferTenantOwnership200,
  TransferTenantOwnershipBody,
  UpdateAppointment200,
  UpdateAppointmentBody,
  UpdateAppointmentBodyStatus,
  UpdateBranch200,
  UpdateBranchBody,
  UpdateBranchBodyWorkHours,
  UpdateBranchBodyWorkHoursAnyOf,
  UpdateBranchBodyWorkHoursAnyOfTwo,
  UpdateQueueTicketStatus200,
  UpdateQueueTicketStatusBody,
  UpdateQueueTicketStatusBodyStatus,
  UpdateService200,
  UpdateServiceBody,
  UpdateTenant200,
  UpdateTenantBody,
  UpdateTenantBodyDefaultLanguage,
  UpdateTenantSettings200,
  UpdateTenantSettingsBody,
} from './generated/model/index.ts';
// Generated (orval) — notifications
export type {
  ListNotificationsResult,
  MarkAllNotificationsReadResult,
  MarkNotificationReadResult,
} from './generated/notifications/notifications.ts';
export {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './generated/notifications/notifications.ts';
// Generated (orval) — permissions
export type { ListPermissionsResult } from './generated/permissions/permissions.ts';
export { listPermissions } from './generated/permissions/permissions.ts';
// Generated (orval) — queue
export type {
  CreateQueueTicketResult,
  GetCheckInCandidatesResult,
  GetQueueTodayResult,
  UpdateQueueTicketStatusResult,
} from './generated/queue/queue.ts';
export {
  createQueueTicket,
  getCheckInCandidates,
  getQueueToday,
  updateQueueTicketStatus,
} from './generated/queue/queue.ts';
// Generated (orval) — services
export type {
  CreateServiceResult,
  DeleteServiceResult,
  GetServiceResult,
  ListServicesResult,
  SetServicePriceResult,
  UpdateServiceResult,
} from './generated/services/services.ts';
export {
  createService,
  deleteService,
  getService,
  listServices,
  setServicePrice,
  updateService,
} from './generated/services/services.ts';
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
export * from './types-patients.ts';
export * from './types-reports.ts';
