import {
  getTenantSettings,
  type UpdateTenantSettingsBody,
  updateTenantSettings,
} from '@dental/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api.ts';
import { settingsKeys } from './settings.keys';

// --- Roles ---
export function useRoles() {
  return useQuery({ queryKey: settingsKeys.roles(), queryFn: api.roles.list });
}

export function useRole(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: settingsKeys.role(id ?? ''),
    queryFn: () => api.roles.get(id ?? ''),
    enabled: enabled && !!id,
  });
}

export function usePermissions() {
  return useQuery({ queryKey: settingsKeys.permissions(), queryFn: api.permissions.list });
}

export function useUpsertRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string | null;
      name: string;
      description?: string;
      permissions: string[];
    }) => {
      if (input.id) {
        await api.roles.update(input.id, { name: input.name, description: input.description });
        await api.roles.setPermissions(input.id, input.permissions);
        return;
      }
      await api.roles.create({
        name: input.name,
        description: input.description,
        permissions: input.permissions,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.roles() }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.roles.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.roles() }),
  });
}

// --- Users / assignments ---
export function useUsers() {
  return useQuery({ queryKey: settingsKeys.users(), queryFn: api.users.listAssignments });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { phone: string; fullName: string; roleId: string; branchId?: string }) =>
      api.users.invite(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.users() }),
  });
}

export function useRemoveAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => api.users.removeAssignment(assignmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.users() }),
  });
}

export function useResetPassword() {
  return useMutation({ mutationFn: (userId: string) => api.users.resetPassword(userId) });
}

// --- Staff profile (users sub-resource) ---
export function useStaffProfile(userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: settingsKeys.staffProfile(userId ?? ''),
    queryFn: () => api.users.profile.get(userId ?? ''),
    enabled: enabled && !!userId,
  });
}

export function useUpsertProfile(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      specialty?: string;
      employmentStatus?: 'active' | 'on_leave' | 'inactive';
      startedAt?: string;
      baseSalary: number;
      commissionPercent: number;
    }) => api.users.profile.put(userId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.staffProfile(userId) });
      qc.invalidateQueries({ queryKey: settingsKeys.users() });
    },
  });
}

// --- Branches ---
export function useBranches() {
  return useQuery({ queryKey: settingsKeys.branches(), queryFn: api.branches.list });
}

export function useUpsertBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string | null; name: string; address?: string; phone?: string }) =>
      input.id
        ? api.branches.update(input.id, {
            name: input.name,
            address: input.address,
            phone: input.phone,
          })
        : api.branches.create({ name: input.name, address: input.address, phone: input.phone }),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.branches() }),
  });
}

export function useDeleteBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.branches.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.branches() }),
  });
}

// --- Tenant ---
export function useTenant() {
  return useQuery({ queryKey: settingsKeys.tenant(), queryFn: api.tenant.get });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; defaultLanguage?: 'uz' | 'ru' }) => api.tenant.update(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.tenant() }),
  });
}

// --- Tenant settings (klinika sozlamalari) ---
export function useTenantSettings() {
  return useQuery({
    queryKey: settingsKeys.tenantSettings(),
    queryFn: () => getTenantSettings().then((res) => res.data),
  });
}

export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTenantSettingsBody) =>
      updateTenantSettings(body).then((res) => res.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.tenantSettings() }),
  });
}

export function useTransferOwnership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { newOwnerUserId: string; currentPassword: string }) =>
      api.tenant.transferOwnership(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.tenant() }),
  });
}
