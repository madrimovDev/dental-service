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
import type {
  Appointment,
  AppointmentStatus,
  CashierListResponse,
  CashierTransactionWithItems,
  DailySummary,
  PaymentMethod,
  QueueStatus,
  QueueTicket,
  Service,
  ServicePrice,
  ServiceWithPrices,
} from './types-m3.ts';
import type {
  AllergyEntry,
  MedicalRecord,
  Patient,
  PatientListResponse,
  PregnancyStatus,
  TestResults,
} from './types-patients.ts';

export const createEndpoints = (api: ApiClient) => ({
  auth: {
    registerTenant: (body: {
      tenantName: string;
      ownerEmail: string;
      ownerPhone?: string;
      ownerFullName: string;
      ownerPassword: string;
      defaultLanguage?: 'uz' | 'ru';
    }) => api.post<RegisterTenantResponse>('/api/auth/register-tenant', body),

    login: (body: { identifier: string; password: string }) =>
      api.post<LoginResponse>('/api/auth/login', body),

    refresh: (refreshToken: string) =>
      api.post<RefreshResponse>('/api/auth/refresh', { refreshToken }),

    logout: (refreshToken: string) =>
      api.post<{ loggedOut: true }>('/api/auth/logout', { refreshToken }),

    me: () => api.get<MembershipsResponse>('/api/auth/me'),

    switchWorkspace: (body: { tenantId: string; branchId?: string }) =>
      api.post<SwitchWorkspaceResponse>('/api/auth/switch-workspace', body),

    requestPasswordReset: (identifier: string) =>
      api.post<{ sent: true }>('/api/auth/password-reset-request', { identifier }),

    resetPassword: (token: string, newPassword: string) =>
      api.post<{ ok: true }>('/api/auth/password-reset', { token, newPassword }),
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
    invite: (body: {
      email: string;
      phone?: string;
      fullName: string;
      roleId: string;
      branchId?: string;
    }) => api.post<InviteUserResponse>('/api/users/invite', body),
    removeAssignment: (assignmentId: string) =>
      api.delete<{ deleted: true }>(`/api/users/assignments/${assignmentId}`),
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
    create: (body: {
      fullName: string;
      dateOfBirth?: string;
      gender?: 'male' | 'female' | 'other';
      phone?: string;
      phoneSecondary?: string;
      passport?: string;
      address?: string;
      notes?: string;
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
    }) => api.post<CashierTransactionWithItems>('/api/cashier/transactions', body),
    refund: (id: string) =>
      api.post<CashierTransactionWithItems>(`/api/cashier/transactions/${id}/refund`),
    dailySummary: (branchId: string, date: string) =>
      api.get<DailySummary>(`/api/cashier/daily-summary?branchId=${branchId}&date=${date}`),
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
    create: (body: { branchId: string; patientId?: string; serviceId?: string }) =>
      api.post<QueueTicket>('/api/queue', body),
    updateStatus: (id: string, status: QueueStatus, doctorId?: string) =>
      api.patch<QueueTicket>(`/api/queue/${id}/status`, { status, doctorId }),
  },
});

export type Endpoints = ReturnType<typeof createEndpoints>;
