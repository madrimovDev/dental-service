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
// Generated (orval) — auth
export type {
  ChangePasswordResult,
  GetMeResult,
  LoginResult,
  LogoutResult,
  PasswordResetRequestResult,
  PasswordResetResult,
  RefreshResult,
  RegisterTenantResult,
  SwitchWorkspaceResult,
} from './generated/auth/auth.ts';
export {
  changePassword,
  getMe,
  login,
  logout,
  passwordReset,
  passwordResetRequest,
  refresh,
  registerTenant,
  switchWorkspace,
} from './generated/auth/auth.ts';
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
// Generated (orval) — cashier
export type {
  CreateCashierTransactionResult,
  GetCashierDailySummaryResult,
  GetCashierPlanBalanceResult,
  GetCashierTransactionResult,
  ListCashierTransactionsResult,
  RefundCashierTransactionResult,
} from './generated/cashier/cashier.ts';
export {
  createCashierTransaction,
  getCashierDailySummary,
  getCashierPlanBalance,
  getCashierTransaction,
  listCashierTransactions,
  refundCashierTransaction,
} from './generated/cashier/cashier.ts';
// Generated (orval) — consent
export type {
  CreateConsentTemplateResult,
  GetConsentTemplateResult,
  ListConsentFormsResult,
  ListConsentTemplatesResult,
  SignConsentFormResult,
  UpdateConsentTemplateResult,
} from './generated/consent/consent.ts';
export {
  createConsentTemplate,
  getConsentTemplate,
  listConsentForms,
  listConsentTemplates,
  signConsentForm,
  updateConsentTemplate,
} from './generated/consent/consent.ts';
// Generated (orval) — diagnoses
export type { ListDiagnosesResult } from './generated/diagnoses/diagnoses.ts';
export { listDiagnoses } from './generated/diagnoses/diagnoses.ts';
// Generated (orval) — expenses
export type {
  CreateExpenseCategoryResult,
  CreateExpenseResult,
  DeleteExpenseCategoryResult,
  DeleteExpenseResult,
  ExpenseSummaryResult,
  GetExpenseResult,
  ListExpenseCategoriesResult,
  ListExpensesResult,
  UpdateExpenseCategoryResult,
  UpdateExpenseResult,
} from './generated/expenses/expenses.ts';
export {
  createExpense,
  createExpenseCategory,
  deleteExpense,
  deleteExpenseCategory,
  expenseSummary,
  getExpense,
  listExpenseCategories,
  listExpenses,
  updateExpense,
  updateExpenseCategory,
} from './generated/expenses/expenses.ts';
// Generated (orval) — lab-orders
export type {
  CreateLabOrderResult,
  GetLabOrderResult,
  ListLabOrdersResult,
  UpdateLabOrderResult,
} from './generated/lab-orders/lab-orders.ts';
export {
  createLabOrder,
  getLabOrder,
  listLabOrders,
  updateLabOrder,
} from './generated/lab-orders/lab-orders.ts';
// Generated model types — appointments, services, queue, notifications
// QueueTicketStatus re-exported under both names for backward compatibility
export type {
  Appointment,
  AppointmentStatsReport,
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
  ConsentForm,
  ConsentFormType,
  ConsentTemplate,
  ConsentTemplateType,
  CreateAppointment201,
  CreateAppointmentBody,
  CreateBranch201,
  CreateBranchBody,
  CreateBranchBodyWorkHours,
  CreateBranchBodyWorkHoursAnyOf,
  CreateBranchBodyWorkHoursAnyOfTwo,
  CreateConsentTemplate201,
  CreateConsentTemplateBody,
  CreateConsentTemplateBodyType,
  CreateLabOrder201,
  CreateLabOrderBody,
  CreateLabOrderBodyItemsItem,
  CreateLabOrderBodyOrderType,
  CreatePayrollRun201,
  CreatePayrollRunBody,
  CreatePrescription201,
  CreatePrescriptionBody,
  CreatePrescriptionBodyItemsItem,
  CreateQueueTicket201,
  CreateQueueTicketBody,
  CreateRole201,
  CreateRoleBody,
  CreateService201,
  CreateServiceBody,
  CreateToothChart201,
  CreateToothChartBody,
  CreateToothChartBodyStatesItem,
  CreateToothChartBodyStatesItemState,
  CreateToothChartBodyStatesItemSurface,
  CreateTreatmentPlan201,
  CreateTreatmentPlanBody,
  CreateTreatmentPlanBodyStagesItem,
  CreateVisitNote201,
  CreateVisitNoteBody,
  DeleteAssignmentResult,
  DeleteBranch200,
  DeletePrescription200,
  DeleteRole200,
  DeleteService200,
  DeleteUserAssignment200,
  Diagnosis,
  DoctorWorkloadRow,
  ErrorResponse,
  ErrorResponseError,
  ErrorResponseErrorDetails,
  FinalizePayrollRun200,
  GetAppointment200,
  GetBranch200,
  GetCheckInCandidates200,
  GetCheckInCandidatesParams,
  GetConsentTemplate200,
  GetLabOrder200,
  GetLatestToothChart200,
  GetPayrollRun200,
  GetPrescription200,
  GetQueueToday200,
  GetQueueTodayParams,
  GetRole200,
  GetService200,
  GetTenant200,
  LabOrder,
  LabOrderItemsItem,
  LabOrderOrderType,
  LabOrderStatus,
  ListAppointments200,
  ListAppointmentsParams,
  ListAuditLog200,
  ListAuditLogParams,
  ListBranches200,
  ListConsentForms200,
  ListConsentFormsParams,
  ListConsentTemplates200,
  ListConsentTemplatesParams,
  ListConsentTemplatesType,
  ListDiagnoses200,
  ListDiagnosesParams,
  ListLabOrders200,
  ListLabOrdersParams,
  ListLabOrdersStatus,
  ListNotifications200,
  ListNotificationsParams,
  ListPayrollRuns200,
  ListPermissions200,
  ListPrescriptions200,
  ListPrescriptionsParams,
  ListRoles200,
  ListServices200,
  ListToothCharts200,
  ListTreatmentPlans200,
  ListTreatmentPlansParams,
  ListUserAssignments200,
  ListVisitNotes200,
  ListVisitNotesParams,
  MarkAllNotificationsRead200,
  MarkNotificationRead200,
  Notification,
  NotificationMarkAllReadResult,
  NotificationMarkReadResult,
  NotificationsFeed,
  NotificationsFeedMeta,
  PayrollLine,
  PayrollRun,
  PayrollRunStatus,
  PayrollRunWithLines,
  PayrollRunWithLinesAllOf,
  PermissionDef,
  PlanCompletionReport,
  Prescription,
  PrescriptionDeleteResult,
  PrescriptionItem,
  QueueTicket,
  QueueTicketStatus,
  QueueTicketStatus as QueueStatus,
  ResetPasswordResponse,
  ResetUserPassword200,
  RevenueReport,
  Role,
  RoleDeleteResult,
  RolePermissionsResult,
  RoleWithPermissions,
  Service,
  ServiceDeleteResult,
  ServicePrice,
  ServiceWithPrices,
  ServiceWithPricesAllOf,
  SetRolePermissions200,
  SetRolePermissionsBody,
  SetServicePrice201,
  SetServicePriceBody,
  SignConsentForm201,
  SignConsentFormBody,
  SignConsentFormBodyLanguage,
  SignConsentFormBodyType,
  StaffProfile,
  StaffProfileEmploymentStatus,
  Tenant,
  TenantSettings,
  TenantSubscriptionStatus,
  ToothChart,
  ToothChartWithStates,
  ToothChartWithStatesAllOf,
  ToothStateEntry,
  ToothStateEntryState,
  ToothStateEntrySurface,
  TransferTenantOwnership200,
  TransferTenantOwnershipBody,
  TreatmentPlan,
  TreatmentPlanStatus,
  TreatmentPlanWithStages,
  TreatmentPlanWithStagesAllOf,
  TreatmentStage,
  TreatmentStageStatus,
  UpdateAppointment200,
  UpdateAppointmentBody,
  UpdateAppointmentBodyStatus,
  UpdateBranch200,
  UpdateBranchBody,
  UpdateBranchBodyWorkHours,
  UpdateBranchBodyWorkHoursAnyOf,
  UpdateBranchBodyWorkHoursAnyOfTwo,
  UpdateConsentTemplate200,
  UpdateConsentTemplateBody,
  UpdateConsentTemplateBodyType,
  UpdateLabOrder200,
  UpdateLabOrderBody,
  UpdateLabOrderBodyItemsItem,
  UpdateLabOrderBodyOrderType,
  UpdateLabOrderBodyStatus,
  UpdatePrescription200,
  UpdatePrescriptionBody,
  UpdatePrescriptionBodyItemsItem,
  UpdateQueueTicketStatus200,
  UpdateQueueTicketStatusBody,
  UpdateQueueTicketStatusBodyStatus,
  UpdateRole200,
  UpdateRoleBody,
  UpdateService200,
  UpdateServiceBody,
  UpdateTenant200,
  UpdateTenantBody,
  UpdateTenantBodyDefaultLanguage,
  UpdateTenantSettings200,
  UpdateTenantSettingsBody,
  UpdateTreatmentPlan200,
  UpdateTreatmentPlanBody,
  UpdateTreatmentPlanBodyStatus,
  UpdateTreatmentStage200,
  UpdateTreatmentStageBody,
  UpdateTreatmentStageBodyStatus,
  UpdateUserAssignment200,
  UpdateUserAssignmentBody,
  UpdateVisitNote200,
  UpdateVisitNoteBody,
  UpsertUserProfile200,
  UpsertUserProfileBody,
  UpsertUserProfileBodyEmploymentStatus,
  UserAssignment,
  UserAssignmentRow,
  VisitNote,
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
// Generated (orval) — patient-images (READ + JSON mutatsiya; upload hand `api.upload()`'da qoladi)
export type {
  DeletePatientImageResult,
  GetPatientImageResult,
  ListPatientImagesResult,
  UpdatePatientImageResult,
} from './generated/patient-images/patient-images.ts';
export {
  deletePatientImage,
  getPatientImage,
  listPatientImages,
  updatePatientImage,
} from './generated/patient-images/patient-images.ts';
// Generated (orval) — patients
export type {
  AddPatientRelativeResult,
  ArchivePatientResult,
  CreatePatientResult,
  GetMedicalRecordResult,
  GetPatientBalanceResult,
  GetPatientResult,
  ListPatientRelativesResult,
  ListPatientsResult,
  RemovePatientRelativeResult,
  UpdateMedicalRecordResult,
  UpdatePatientResult,
} from './generated/patients/patients.ts';
export {
  addPatientRelative,
  archivePatient,
  createPatient,
  getMedicalRecord,
  getPatient,
  getPatientBalance,
  listPatientRelatives,
  listPatients,
  removePatientRelative,
  updateMedicalRecord,
  updatePatient,
} from './generated/patients/patients.ts';
// Generated (orval) — payroll
export type {
  CreatePayrollRunResult,
  FinalizePayrollRunResult,
  GetPayrollRunResult,
  ListPayrollRunsResult,
} from './generated/payroll/payroll.ts';
export {
  createPayrollRun,
  finalizePayrollRun,
  getPayrollRun,
  listPayrollRuns,
} from './generated/payroll/payroll.ts';
// Generated (orval) — permissions
export type { ListPermissionsResult } from './generated/permissions/permissions.ts';
export { listPermissions } from './generated/permissions/permissions.ts';
// Generated (orval) — prescriptions
export type {
  CreatePrescriptionResult,
  DeletePrescriptionResult,
  GetPrescriptionResult,
  ListPrescriptionsResult,
  UpdatePrescriptionResult,
} from './generated/prescriptions/prescriptions.ts';
export {
  createPrescription,
  deletePrescription,
  getPrescription,
  listPrescriptions,
  updatePrescription,
} from './generated/prescriptions/prescriptions.ts';
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
// Generated (orval) — reports
export type {
  GetAppointmentStatsReportResult,
  GetDoctorWorkloadReportResult,
  GetPlanCompletionReportResult,
  GetRevenueReportResult,
} from './generated/reports/reports.ts';
export {
  getAppointmentStatsReport,
  getDoctorWorkloadReport,
  getPlanCompletionReport,
  getRevenueReport,
} from './generated/reports/reports.ts';
// Generated (orval) — roles
export type {
  CreateRoleResult,
  DeleteRoleResult,
  GetRoleResult,
  ListRolesResult,
  SetRolePermissionsResult,
  UpdateRoleResult,
} from './generated/roles/roles.ts';
export {
  createRole,
  deleteRole,
  getRole,
  listRoles,
  setRolePermissions,
  updateRole,
} from './generated/roles/roles.ts';
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
// Generated (orval) — stock
export type {
  CreateStockBomResult,
  CreateStockItemResult,
  CreateStockMovementResult,
  GetStockItemResult,
  ListStockBomResult,
  ListStockItemsResult,
  ListStockMovementsResult,
  RemoveStockBomResult,
  UpdateStockItemResult,
} from './generated/stock/stock.ts';
export {
  createStockBom,
  createStockItem,
  createStockMovement,
  getStockItem,
  listStockBom,
  listStockItems,
  listStockMovements,
  removeStockBom,
  updateStockItem,
} from './generated/stock/stock.ts';
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
// Generated (orval) — tooth-charts
export type {
  CreateToothChartResult,
  GetLatestToothChartResult,
  ListToothChartsResult,
} from './generated/tooth-charts/tooth-charts.ts';
export {
  createToothChart,
  getLatestToothChart,
  listToothCharts,
} from './generated/tooth-charts/tooth-charts.ts';
// Generated (orval) — treatment-plans
export type {
  CreateTreatmentPlanResult,
  GetTreatmentPlanResult,
  ListTreatmentPlansResult,
  UpdateTreatmentPlanResult,
  UpdateTreatmentStageResult,
} from './generated/treatment-plans/treatment-plans.ts';
export {
  createTreatmentPlan,
  getTreatmentPlan,
  listTreatmentPlans,
  updateTreatmentPlan,
  updateTreatmentStage,
} from './generated/treatment-plans/treatment-plans.ts';
// Generated (orval) — users
export type {
  AddUserAssignmentResult,
  DeleteUserAssignmentResult,
  GetUserProfileResult,
  InviteUserResult,
  ListUserAssignmentsResult,
  ResetUserPasswordResult,
  UpdateUserAssignmentResult,
  UpsertUserProfileResult,
} from './generated/users/users.ts';
export {
  addUserAssignment,
  deleteUserAssignment,
  getUserProfile,
  inviteUser,
  listUserAssignments,
  resetUserPassword,
  updateUserAssignment,
  upsertUserProfile,
} from './generated/users/users.ts';
// Generated (orval) — visit-notes
export type {
  CreateVisitNoteResult,
  GetVisitNoteResult,
  ListVisitNotesResult,
  UpdateVisitNoteResult,
} from './generated/visit-notes/visit-notes.ts';
export {
  createVisitNote,
  getVisitNote,
  listVisitNotes,
  updateVisitNote,
} from './generated/visit-notes/visit-notes.ts';
export type { CustomInstanceConfig } from './mutator.ts';
export { configureClient, customInstance, isClientConfigured } from './mutator.ts';
export * from './types-clinical.ts';
export * from './types-erp.ts';
export * from './types-m3.ts';
export * from './types-m5.ts';
export * from './types-patients.ts';
