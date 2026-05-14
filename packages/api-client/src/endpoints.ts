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
});

export type Endpoints = ReturnType<typeof createEndpoints>;
