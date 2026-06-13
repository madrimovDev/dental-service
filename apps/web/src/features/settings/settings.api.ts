import {
  createBranch,
  createRole,
  deleteBranch,
  deleteRole,
  deleteUserAssignment,
  getRole,
  getTenant,
  getTenantSettings,
  getTenantVertical,
  getUserProfile,
  inviteUser,
  listBranches,
  listPermissions,
  listRoles,
  listUserAssignments,
  resetUserPassword,
  setRolePermissions,
  type TransferTenantOwnershipBody,
  transferTenantOwnership,
  type UpdateBranchBody,
  type UpdateTenantBody,
  type UpdateTenantSettingsBody,
  updateBranch,
  updateRole,
  updateTenant,
  updateTenantSettings,
  upsertUserProfile,
} from '@dental/api-client';
import type { Vertical } from '@dental/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { settingsKeys } from './settings.keys';

// --- Roles ---
export function useRoles() {
  return useQuery({
    queryKey: settingsKeys.roles(),
    queryFn: () => listRoles().then((r) => r.data),
  });
}

export function useRole(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: settingsKeys.role(id ?? ''),
    queryFn: () => getRole(id ?? '').then((r) => r.data),
    enabled: enabled && !!id,
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: settingsKeys.permissions(),
    queryFn: () => listPermissions().then((r) => r.data),
  });
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
        await updateRole(input.id, { name: input.name, description: input.description });
        await setRolePermissions(input.id, { permissions: input.permissions });
        return;
      }
      await createRole({
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
    mutationFn: (id: string) => deleteRole(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.roles() }),
  });
}

// --- Users / assignments ---
export function useUsers() {
  return useQuery({
    queryKey: settingsKeys.users(),
    queryFn: () => listUserAssignments().then((r) => r.data),
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { phone: string; fullName: string; roleId: string; branchId?: string }) =>
      inviteUser(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.users() }),
  });
}

export function useRemoveAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => deleteUserAssignment(assignmentId).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.users() }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (userId: string) => resetUserPassword(userId).then((r) => r.data),
  });
}

// --- Staff profile (users sub-resource) ---
export function useStaffProfile(userId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: settingsKeys.staffProfile(userId ?? ''),
    queryFn: () => getUserProfile(userId ?? '').then((r) => r.data),
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
    }) => upsertUserProfile(userId, body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.staffProfile(userId) });
      qc.invalidateQueries({ queryKey: settingsKeys.users() });
    },
  });
}

// --- Branches ---
export function useBranches() {
  return useQuery({
    queryKey: settingsKeys.branches(),
    queryFn: () => listBranches().then((r) => r.data),
  });
}

export function useUpsertBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string | null; name: string; address?: string; phone?: string }) => {
      const body: UpdateBranchBody = {
        name: input.name,
        address: input.address,
        phone: input.phone,
      };
      return input.id
        ? updateBranch(input.id, body).then((r) => r.data)
        : createBranch({ name: input.name, address: input.address, phone: input.phone }).then(
            (r) => r.data,
          );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.branches() }),
  });
}

export function useDeleteBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBranch(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.branches() }),
  });
}

// --- Tenant ---
export function useTenant() {
  return useQuery({
    queryKey: settingsKeys.tenant(),
    queryFn: () => getTenant().then((r) => r.data),
  });
}

export function useUpdateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTenantBody) => updateTenant(body).then((r) => r.data),
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

/**
 * Tenant verticalini yengil (permission'siz) endpoint orqali o'qiydi — HAR rol chaqira oladi.
 * `useTenantSettings` (`tenant_settings.view`) faqat Tenant Admin'da; UI gating har rolga kerak
 * (CLI-80, CLI-153 takrori).
 */
export function useTenantVertical() {
  return useQuery({
    queryKey: settingsKeys.tenantVertical(),
    queryFn: () => getTenantVertical().then((r) => r.data),
  });
}

/** Joriy tenant verticali (yuklanmaguncha default 'dental'). */
export function useVertical(): Vertical {
  const { data } = useTenantVertical();
  return (data?.vertical ?? 'dental') as Vertical;
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
    mutationFn: (body: TransferTenantOwnershipBody) =>
      transferTenantOwnership(body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.tenant() }),
  });
}
