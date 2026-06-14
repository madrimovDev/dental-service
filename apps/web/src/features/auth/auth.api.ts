import {
  type ApiError,
  getMe,
  getWorkspaceBranches,
  login,
  passwordReset,
  passwordResetRequest,
  registerTenant,
  switchWorkspace,
} from '@dental/api-client';
import { type UseMutationOptions, useMutation, useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth-store.ts';
import { authKeys } from './auth.keys';

// Yordamchi: api-client funksiya javobining data tipini ajratib oladi
type Data<F extends (...args: never[]) => Promise<{ data: unknown }>> = Awaited<
  ReturnType<F>
>['data'];

type LoginVars = { phone: string; password: string };
export function useLogin(opts?: UseMutationOptions<Data<typeof login>, ApiError, LoginVars>) {
  return useMutation({
    mutationFn: (body: LoginVars) => login(body).then((r) => r.data),
    ...opts,
  });
}

type RegisterVars = Parameters<typeof registerTenant>[0];
export function useRegisterTenant(
  opts?: UseMutationOptions<Data<typeof registerTenant>, ApiError, RegisterVars>,
) {
  return useMutation({
    mutationFn: (body: RegisterVars) => registerTenant(body).then((r) => r.data),
    ...opts,
  });
}

type ResetRequestVars = { phone: string };
export function usePasswordResetRequest(
  opts?: UseMutationOptions<Data<typeof passwordResetRequest>, ApiError, ResetRequestVars>,
) {
  return useMutation({
    mutationFn: (body: ResetRequestVars) => passwordResetRequest(body).then((r) => r.data),
    ...opts,
  });
}

type ResetVars = { token: string; newPassword: string };
export function usePasswordReset(
  opts?: UseMutationOptions<Data<typeof passwordReset>, ApiError, ResetVars>,
) {
  return useMutation({
    mutationFn: (body: ResetVars) => passwordReset(body).then((r) => r.data),
    ...opts,
  });
}

// Login'dan keyin a'zoliklarni o'qish (active workspace HALI yo'q — accessToken bilan gated)
export function useMe() {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: () => getMe().then((r) => r.data),
    enabled: !!accessToken,
  });
}

// Joriy tenant ichidagi RBAC-safe filiallar (CLI-157)
export function useWorkspaceBranches() {
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  return useQuery({
    queryKey: authKeys.workspaceBranches(activeTenantId),
    queryFn: () => getWorkspaceBranches().then((r) => r.data),
    enabled: !!activeTenantId,
  });
}

// Workspace (tenant/branch) almashtirish — refreshToken store'dan, rotation chain davom etadi.
// 2 joyda ishlatiladi (SelectWorkspace + BranchSwitcher), shu sabab opts config darajasida.
type SwitchVars = { tenantId: string; branchId?: string };
export function useSwitchWorkspace(
  opts?: UseMutationOptions<Data<typeof switchWorkspace>, ApiError, SwitchVars>,
) {
  return useMutation({
    mutationFn: (input: SwitchVars) => {
      const rt = useAuthStore.getState().refreshToken;
      if (!rt) throw new Error('No refresh token');
      return switchWorkspace({ ...input, refreshToken: rt }).then((r) => r.data);
    },
    ...opts,
  });
}
