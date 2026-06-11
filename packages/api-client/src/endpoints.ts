import type { ApiClient } from './client.ts';
import type {
  Branch,
  InviteUserResponse,
  LoginResponse,
  MembershipsResponse,
  PermissionDef,
  RefreshResponse,
  RegisterTenantResponse,
  Role,
  SwitchWorkspaceResponse,
  Tenant,
  UserAssignment,
} from './types.ts';
import type { AuditListResponse } from './types-audit.ts';
import type {
  CreateToothChartInput,
  CreateTreatmentPlanInput,
  CreateVisitNoteInput,
  Diagnosis,
  ToothChart,
  ToothChartWithStates,
  TreatmentPlan,
  TreatmentPlanStatus,
  TreatmentPlanWithStages,
  TreatmentStage,
  TreatmentStageStatus,
  VisitNote,
} from './types-clinical.ts';
import type {
  Expense,
  ExpenseCategory,
  ExpenseListResponse,
  ExpenseSummary,
  PatientRelativeView,
  ServiceMaterial,
  StockItem,
  StockItemWithLowStock,
  StockMovement,
} from './types-erp.ts';
import type { PayrollRun, PayrollRunWithLines, StaffProfile } from './types-hr.ts';
import type {
  Appointment,
  AppointmentStatus,
  CashierListResponse,
  CashierTransactionWithItems,
  DailySummary,
  PaymentMethod,
  PlanBalance,
  QueueStatus,
  QueueTicket,
  Service,
  ServicePrice,
  ServiceWithPrices,
} from './types-m3.ts';
import type {
  ConsentForm,
  ConsentTemplate,
  ConsentType,
  CreateLabOrderInput,
  CreatePrescriptionInput,
  CreateTemplateInput,
  LabOrder,
  LabOrderStatus,
  LabOrderType,
  PatientImage,
  PatientImageType,
  Prescription,
  SignFormInput,
} from './types-m5.ts';
import type {
  AllergyEntry,
  MedicalRecord,
  Patient,
  PatientBalance,
  PatientListResponse,
  PregnancyStatus,
  TestResults,
} from './types-patients.ts';
import type {
  AppointmentStatsReport,
  DoctorWorkloadRow,
  PlanCompletionReport,
  RevenueReport,
} from './types-reports.ts';

export const createEndpoints = (api: ApiClient) => ({
  auth: {
    registerTenant: (body: {
      tenantName: string;
      ownerPhone: string;
      ownerFullName: string;
      ownerPassword: string;
      defaultLanguage?: 'uz' | 'ru';
    }) => api.post<RegisterTenantResponse>('/api/auth/register-tenant', body),

    login: (body: { phone: string; password: string }) =>
      api.post<LoginResponse>('/api/auth/login', body),

    refresh: (refreshToken: string) =>
      api.post<RefreshResponse>('/api/auth/refresh', { refreshToken }),

    logout: (refreshToken: string) =>
      api.post<{ loggedOut: true }>('/api/auth/logout', { refreshToken }),

    me: () => api.get<MembershipsResponse>('/api/auth/me'),

    switchWorkspace: (body: { tenantId: string; branchId?: string; refreshToken: string }) =>
      api.post<SwitchWorkspaceResponse>('/api/auth/switch-workspace', body),

    requestPasswordReset: (phone: string) =>
      api.post<{ sent: true }>('/api/auth/password-reset-request', { phone }),

    resetPassword: (token: string, newPassword: string) =>
      api.post<{ ok: true }>('/api/auth/password-reset', { token, newPassword }),

    changePassword: (currentPassword: string, newPassword: string) =>
      api.post<{ changed: true }>('/api/auth/change-password', { currentPassword, newPassword }),
  },

  tenant: {
    get: () => api.get<Tenant>('/api/tenant'),
    update: (body: { name?: string; defaultLanguage?: 'uz' | 'ru' }) =>
      api.patch<Tenant>('/api/tenant', body),
    transferOwnership: (body: { newOwnerUserId: string; currentPassword: string }) =>
      api.post<Tenant>('/api/tenant/transfer-ownership', body),
  },

  branches: {
    list: () => api.get<Branch[]>('/api/branches'),
    get: (id: string) => api.get<Branch>(`/api/branches/${id}`),
    create: (body: { name: string; address?: string; phone?: string }) =>
      api.post<Branch>('/api/branches', body),
    update: (id: string, body: { name?: string; address?: string; phone?: string }) =>
      api.patch<Branch>(`/api/branches/${id}`, body),
    remove: (id: string) => api.delete<{ deleted: true; id: string }>(`/api/branches/${id}`),
  },

  roles: {
    list: () => api.get<Role[]>('/api/roles'),
    get: (id: string) => api.get<Role>(`/api/roles/${id}`),
    create: (body: { name: string; description?: string; permissions?: string[] }) =>
      api.post<Role>('/api/roles', body),
    update: (id: string, body: { name?: string; description?: string }) =>
      api.patch<Role>(`/api/roles/${id}`, body),
    setPermissions: (id: string, permissions: string[]) =>
      api.put<{ roleId: string; permissions: string[] }>(`/api/roles/${id}/permissions`, {
        permissions,
      }),
    remove: (id: string) => api.delete<{ deleted: true }>(`/api/roles/${id}`),
  },

  permissions: {
    list: () => api.get<PermissionDef[]>('/api/permissions'),
  },

  users: {
    listAssignments: () => api.get<UserAssignment[]>('/api/users/assignments'),
    invite: (body: { phone: string; fullName: string; roleId: string; branchId?: string }) =>
      api.post<InviteUserResponse>('/api/users/invite', body),
    removeAssignment: (assignmentId: string) =>
      api.delete<{ deleted: true }>(`/api/users/assignments/${assignmentId}`),
    resetPassword: (userId: string) =>
      api.post<{ ok: true; userId: string; phone: string; tempPassword: string }>(
        `/api/users/${userId}/reset-password`,
      ),
    profile: {
      get: (userId: string) => api.get<StaffProfile | null>(`/api/users/${userId}/profile`),
      put: (
        userId: string,
        body: {
          specialty?: string;
          employmentStatus?: 'active' | 'on_leave' | 'inactive';
          startedAt?: string;
          baseSalary: number;
          commissionPercent: number;
        },
      ) => api.put<StaffProfile>(`/api/users/${userId}/profile`, body),
    },
  },

  patients: {
    list: (query?: { search?: string; archived?: boolean; page?: number; pageSize?: number }) => {
      const params = new URLSearchParams();
      if (query?.search) params.set('search', query.search);
      if (query?.archived) params.set('archived', 'true');
      if (query?.page) params.set('page', String(query.page));
      if (query?.pageSize) params.set('pageSize', String(query.pageSize));
      const qs = params.toString();
      return api.get<PatientListResponse>(`/api/patients${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => api.get<Patient>(`/api/patients/${id}`),
    balance: (id: string) => api.get<PatientBalance>(`/api/patients/${id}/balance`),
    create: (body: {
      fullName: string;
      dateOfBirth?: string;
      gender?: 'male' | 'female' | 'other';
      phone?: string;
      phoneSecondary?: string;
      passport?: string;
      address?: string;
      notes?: string;
      tags?: string[];
      source?: string;
      insurance?: { provider: string; policyNumber: string } | null;
    }) => api.post<Patient>('/api/patients', body),
    update: (id: string, body: Partial<Patient>) => api.patch<Patient>(`/api/patients/${id}`, body),
    archive: (id: string) => api.delete<{ archived: true; id: string }>(`/api/patients/${id}`),
    getMedical: (id: string) => api.get<MedicalRecord>(`/api/patients/${id}/medical`),
    updateMedical: (
      id: string,
      body: {
        anamnez?: string;
        chronicConditions?: string[];
        currentMedications?: string[];
        allergies?: AllergyEntry[];
        bloodType?: string;
        pregnancyStatus?: PregnancyStatus;
        testResults?: TestResults;
      },
    ) => api.patch<MedicalRecord>(`/api/patients/${id}/medical`, body),
    relatives: {
      list: (patientId: string) =>
        api.get<PatientRelativeView[]>(`/api/patients/${patientId}/relatives`),
      add: (patientId: string, body: { relativePatientId: string; relationship: string }) =>
        api.post<unknown>(`/api/patients/${patientId}/relatives`, body),
      remove: (patientId: string, relId: string) =>
        api.delete<{ removed: true; id: string }>(`/api/patients/${patientId}/relatives/${relId}`),
    },
  },

  services: {
    list: () => api.get<Service[]>('/api/services'),
    get: (id: string) => api.get<ServiceWithPrices>(`/api/services/${id}`),
    create: (body: {
      code: string;
      nameUz: string;
      nameRu?: string;
      category?: string;
      durationMinutes?: number;
      requiredRole?: string;
      descriptionUz?: string;
      descriptionRu?: string;
      isActive?: boolean;
      initialPrice?: number;
      initialBranchId?: string;
    }) => api.post<Service>('/api/services', body),
    update: (id: string, body: Partial<Service>) => api.patch<Service>(`/api/services/${id}`, body),
    remove: (id: string) => api.delete<{ deleted: true }>(`/api/services/${id}`),
    setPrice: (id: string, body: { branchId: string; price: number; currency?: string }) =>
      api.post<ServicePrice>(`/api/services/${id}/prices`, body),
  },

  cashier: {
    list: (query?: {
      branchId?: string;
      patientId?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    }) => {
      const params = new URLSearchParams();
      if (query?.branchId) params.set('branchId', query.branchId);
      if (query?.patientId) params.set('patientId', query.patientId);
      if (query?.from) params.set('from', query.from);
      if (query?.to) params.set('to', query.to);
      if (query?.page) params.set('page', String(query.page));
      if (query?.pageSize) params.set('pageSize', String(query.pageSize));
      const qs = params.toString();
      return api.get<CashierListResponse>(`/api/cashier/transactions${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => api.get<CashierTransactionWithItems>(`/api/cashier/transactions/${id}`),
    create: (body: {
      branchId: string;
      patientId?: string;
      items: Array<{
        serviceId: string;
        serviceName: string;
        quantity: number;
        unitPrice: number;
      }>;
      discount?: number;
      paidAmount: number;
      paymentMethod: PaymentMethod;
      notes?: string;
      treatmentPlanId?: string;
      allocations?: Array<{ stageId: string; amount: number }>;
    }) => api.post<CashierTransactionWithItems>('/api/cashier/transactions', body),
    refund: (id: string) =>
      api.post<CashierTransactionWithItems>(`/api/cashier/transactions/${id}/refund`),
    dailySummary: (branchId: string, date: string) =>
      api.get<DailySummary>(`/api/cashier/daily-summary?branchId=${branchId}&date=${date}`),
    planBalance: (planId: string) => api.get<PlanBalance>(`/api/cashier/plan-balance/${planId}`),
  },

  reports: {
    revenue: (q: { from: string; to: string; branchId?: string }) => {
      const p = new URLSearchParams({ from: q.from, to: q.to });
      if (q.branchId) p.set('branchId', q.branchId);
      return api.get<RevenueReport>(`/api/reports/revenue?${p.toString()}`);
    },
    appointments: (q: { from: string; to: string; branchId?: string }) => {
      const p = new URLSearchParams({ from: q.from, to: q.to });
      if (q.branchId) p.set('branchId', q.branchId);
      return api.get<AppointmentStatsReport>(`/api/reports/appointments?${p.toString()}`);
    },
    doctors: (q: { from: string; to: string; branchId?: string }) => {
      const p = new URLSearchParams({ from: q.from, to: q.to });
      if (q.branchId) p.set('branchId', q.branchId);
      return api.get<DoctorWorkloadRow[]>(`/api/reports/doctors?${p.toString()}`);
    },
    treatmentPlans: (q: { from: string; to: string; branchId?: string }) => {
      const p = new URLSearchParams({ from: q.from, to: q.to });
      if (q.branchId) p.set('branchId', q.branchId);
      return api.get<PlanCompletionReport>(`/api/reports/treatment-plans?${p.toString()}`);
    },
  },

  audit: {
    list: (q?: {
      from?: string;
      to?: string;
      action?: string;
      resourceType?: string;
      userId?: string;
      page?: number;
      pageSize?: number;
    }) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(q ?? {})) if (v != null) p.set(k, String(v));
      const qs = p.toString();
      return api.get<AuditListResponse>(`/api/audit${qs ? `?${qs}` : ''}`);
    },
  },

  expenses: {
    categories: () => api.get<ExpenseCategory[]>('/api/expense-categories'),
    createCategory: (body: { name: string; nameRu?: string }) =>
      api.post<ExpenseCategory>('/api/expense-categories', body),
    updateCategory: (id: string, body: { name?: string; nameRu?: string }) =>
      api.patch<ExpenseCategory>(`/api/expense-categories/${id}`, body),
    removeCategory: (id: string) => api.delete<{ deleted: true }>(`/api/expense-categories/${id}`),
    list: (q?: {
      from?: string;
      to?: string;
      categoryId?: string;
      branchId?: string;
      page?: number;
      pageSize?: number;
    }) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(q ?? {})) if (v != null) p.set(k, String(v));
      const qs = p.toString();
      return api.get<ExpenseListResponse>(`/api/expenses${qs ? `?${qs}` : ''}`);
    },
    create: (body: {
      categoryId?: string;
      branchId?: string;
      amount: number;
      date: string;
      note?: string;
    }) => api.post<Expense>('/api/expenses', body),
    update: (
      id: string,
      body: Partial<{
        categoryId: string;
        branchId: string;
        amount: number;
        date: string;
        note: string;
      }>,
    ) => api.patch<Expense>(`/api/expenses/${id}`, body),
    remove: (id: string) => api.delete<{ deleted: true }>(`/api/expenses/${id}`),
    summary: (q: { from: string; to: string; branchId?: string }) => {
      const p = new URLSearchParams({ from: q.from, to: q.to });
      if (q.branchId) p.set('branchId', q.branchId);
      return api.get<ExpenseSummary>(`/api/expenses/summary?${p.toString()}`);
    },
  },

  stock: {
    items: (q?: { branchId?: string }) => {
      const p = new URLSearchParams();
      if (q?.branchId) p.set('branchId', q.branchId);
      const qs = p.toString();
      return api.get<StockItemWithLowStock[]>(`/api/stock/items${qs ? `?${qs}` : ''}`);
    },
    getItem: (id: string) => api.get<StockItemWithLowStock>(`/api/stock/items/${id}`),
    createItem: (body: {
      name: string;
      unit: string;
      branchId?: string;
      quantity?: number;
      minThreshold?: number;
    }) => api.post<StockItem>('/api/stock/items', body),
    updateItem: (id: string, body: Partial<{ name: string; unit: string; minThreshold: number }>) =>
      api.patch<StockItem>(`/api/stock/items/${id}`, body),
    movements: (itemId: string) =>
      api.get<StockMovement[]>(`/api/stock/movements?itemId=${itemId}`),
    createMovement: (body: {
      itemId: string;
      type: 'in' | 'out' | 'adjustment';
      quantity: number;
      reason?: string;
    }) => api.post<StockMovement>('/api/stock/movements', body),
    bom: (q?: { serviceId?: string }) => {
      const p = new URLSearchParams();
      if (q?.serviceId) p.set('serviceId', q.serviceId);
      const qs = p.toString();
      return api.get<ServiceMaterial[]>(`/api/stock/bom${qs ? `?${qs}` : ''}`);
    },
    createBom: (body: { serviceId: string; itemId: string; qtyPerService: number }) =>
      api.post<ServiceMaterial>('/api/stock/bom', body),
    removeBom: (id: string) => api.delete<{ deleted: true }>(`/api/stock/bom/${id}`),
  },

  payroll: {
    runs: () => api.get<PayrollRun[]>('/api/payroll/runs'),
    getRun: (id: string) => api.get<PayrollRunWithLines>(`/api/payroll/runs/${id}`),
    createRun: (body: { periodFrom: string; periodTo: string }) =>
      api.post<PayrollRunWithLines>('/api/payroll/runs', body),
    finalize: (id: string) => api.post<PayrollRun>(`/api/payroll/runs/${id}/finalize`),
  },

  appointments: {
    list: (query?: {
      branchId?: string;
      doctorId?: string;
      patientId?: string;
      from?: string;
      to?: string;
    }) => {
      const params = new URLSearchParams();
      if (query?.branchId) params.set('branchId', query.branchId);
      if (query?.doctorId) params.set('doctorId', query.doctorId);
      if (query?.patientId) params.set('patientId', query.patientId);
      if (query?.from) params.set('from', query.from);
      if (query?.to) params.set('to', query.to);
      const qs = params.toString();
      return api.get<Appointment[]>(`/api/appointments${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => api.get<Appointment>(`/api/appointments/${id}`),
    create: (body: {
      branchId: string;
      patientId: string;
      doctorId: string;
      assistantId?: string;
      startTime: string;
      endTime: string;
      serviceIds?: string[];
      notes?: string;
    }) => api.post<Appointment>('/api/appointments', body),
    update: (
      id: string,
      body: {
        startTime?: string;
        endTime?: string;
        doctorId?: string;
        status?: AppointmentStatus;
        serviceIds?: string[];
        notes?: string;
      },
    ) => api.patch<Appointment>(`/api/appointments/${id}`, body),
    cancel: (id: string, reason?: string) =>
      api.post<Appointment>(`/api/appointments/${id}/cancel`, { reason }),
  },

  queue: {
    today: (branchId: string) => api.get<QueueTicket[]>(`/api/queue?branchId=${branchId}`),
    create: (body: {
      branchId: string;
      patientId?: string;
      serviceId?: string;
      appointmentId?: string;
    }) => api.post<QueueTicket>('/api/queue', body),
    updateStatus: (id: string, status: QueueStatus, doctorId?: string) =>
      api.patch<QueueTicket>(`/api/queue/${id}/status`, { status, doctorId }),
    checkInCandidates: (branchId: string) =>
      api.get<Appointment[]>(`/api/queue/check-in-candidates?branchId=${branchId}`),
  },

  clinical: {
    listDiagnoses: (search?: string) => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : '';
      return api.get<Diagnosis[]>(`/api/diagnoses${qs}`);
    },

    listPlans: (patientId?: string) => {
      const qs = patientId ? `?patientId=${patientId}` : '';
      return api.get<TreatmentPlan[]>(`/api/treatment-plans${qs}`);
    },
    getPlan: (id: string) => api.get<TreatmentPlanWithStages>(`/api/treatment-plans/${id}`),
    createPlan: (body: CreateTreatmentPlanInput) =>
      api.post<TreatmentPlanWithStages>('/api/treatment-plans', body),
    updatePlan: (
      id: string,
      body: { title?: string; notes?: string; status?: TreatmentPlanStatus },
    ) => api.patch<TreatmentPlan>(`/api/treatment-plans/${id}`, body),
    updateStage: (id: string, body: { status?: TreatmentStageStatus; notes?: string }) =>
      api.patch<TreatmentStage>(`/api/treatment-stages/${id}`, body),

    listVisitNotes: (patientId?: string) => {
      const qs = patientId ? `?patientId=${patientId}` : '';
      return api.get<VisitNote[]>(`/api/visit-notes${qs}`);
    },
    getVisitNote: (id: string) => api.get<VisitNote>(`/api/visit-notes/${id}`),
    createVisitNote: (body: CreateVisitNoteInput) => api.post<VisitNote>('/api/visit-notes', body),
    updateVisitNote: (id: string, body: Partial<CreateVisitNoteInput>) =>
      api.patch<VisitNote>(`/api/visit-notes/${id}`, body),

    listToothCharts: (patientId: string) =>
      api.get<ToothChart[]>(`/api/patients/${patientId}/tooth-charts`),
    getLatestToothChart: (patientId: string) =>
      api.get<ToothChartWithStates | null>(`/api/patients/${patientId}/tooth-charts/latest`),
    createToothChart: (body: CreateToothChartInput) =>
      api.post<ToothChartWithStates>('/api/tooth-charts', body),
  },

  prescriptions: {
    list: (patientId?: string) => {
      const qs = patientId ? `?patientId=${patientId}` : '';
      return api.get<Prescription[]>(`/api/prescriptions${qs}`);
    },
    get: (id: string) => api.get<Prescription>(`/api/prescriptions/${id}`),
    create: (body: CreatePrescriptionInput) => api.post<Prescription>('/api/prescriptions', body),
    update: (id: string, body: Partial<CreatePrescriptionInput>) =>
      api.patch<Prescription>(`/api/prescriptions/${id}`, body),
    remove: (id: string) => api.delete<{ deleted: true }>(`/api/prescriptions/${id}`),
  },

  consent: {
    listTemplates: (type?: ConsentType, activeOnly = true) => {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (!activeOnly) params.set('active', 'false');
      const qs = params.toString();
      return api.get<ConsentTemplate[]>(`/api/consent/templates${qs ? `?${qs}` : ''}`);
    },
    createTemplate: (body: CreateTemplateInput) =>
      api.post<ConsentTemplate>('/api/consent/templates', body),
    updateTemplate: (id: string, body: Partial<CreateTemplateInput>) =>
      api.patch<ConsentTemplate>(`/api/consent/templates/${id}`, body),
    listForms: (patientId?: string) => {
      const qs = patientId ? `?patientId=${patientId}` : '';
      return api.get<ConsentForm[]>(`/api/consent/forms${qs}`);
    },
    signForm: (body: SignFormInput) => api.post<ConsentForm>('/api/consent/forms', body),
  },

  labOrders: {
    list: (query?: { patientId?: string; status?: LabOrderStatus }) => {
      const params = new URLSearchParams();
      if (query?.patientId) params.set('patientId', query.patientId);
      if (query?.status) params.set('status', query.status);
      const qs = params.toString();
      return api.get<LabOrder[]>(`/api/lab-orders${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => api.get<LabOrder>(`/api/lab-orders/${id}`),
    create: (body: CreateLabOrderInput) => api.post<LabOrder>('/api/lab-orders', body),
    update: (
      id: string,
      body: {
        status?: LabOrderStatus;
        labName?: string;
        orderType?: LabOrderType;
        expectedDate?: string | null;
        deliveredDate?: string | null;
        cost?: number | null;
        notes?: string | null;
      },
    ) => api.patch<LabOrder>(`/api/lab-orders/${id}`, body),
  },

  patientImages: {
    list: (patientId: string) => api.get<PatientImage[]>(`/api/patients/${patientId}/images`),
    get: (id: string) => api.get<PatientImage>(`/api/patient-images/${id}`),
    upload: async (form: FormData) => {
      // Special: multipart upload bypasses JSON helpers
      const res = await api.upload<PatientImage>('/api/patient-images', form);
      return res;
    },
    update: (
      id: string,
      body: {
        type?: PatientImageType;
        title?: string | null;
        description?: string | null;
        toothNumbers?: number[] | null;
        takenDate?: string | null;
      },
    ) => api.patch<PatientImage>(`/api/patient-images/${id}`, body),
    remove: (id: string) => api.delete<{ deleted: true }>(`/api/patient-images/${id}`),
  },
});

export type Endpoints = ReturnType<typeof createEndpoints>;
