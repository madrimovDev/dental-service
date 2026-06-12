import type { ApiClient } from './client.ts';
import type {
  LoginResponse,
  MembershipsResponse,
  RefreshResponse,
  RegisterTenantResponse,
  SwitchWorkspaceResponse,
} from './types.ts';
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
import type {
  CashierListResponse,
  CashierTransactionWithItems,
  DailySummary,
  PaymentMethod,
  PlanBalance,
} from './types-m3.ts';
import type { PatientImage, PatientImageType } from './types-m5.ts';
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
