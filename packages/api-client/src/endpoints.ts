import type { ApiClient } from './client.ts';
import type {
  LoginResponse,
  MembershipsResponse,
  RefreshResponse,
  RegisterTenantResponse,
  SwitchWorkspaceResponse,
} from './types.ts';
import type { PatientImage, PatientImageType } from './types-m5.ts';

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
