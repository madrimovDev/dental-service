import {
  ApiError,
  getMe,
  getWorkspaceBranches,
  login,
  registerTenant,
  switchWorkspace,
} from '@dental/api-client';
import { notifications } from '@mantine/notifications';
import {
  type UseMutationOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
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

/**
 * Filial almashtirish orchestratsiyasi — JWT decode + setTokens/setContext + queryClient.clear()
 * + revocation triage (auth.refresh_revoked/invalid_refresh/refresh_mismatch → clear + /login).
 * SidebarWorkspaceSwitcher ishlatadi. SelectWorkspacePage — boshqa tartib (setContext oldin,
 * queryClient.clear() yo'q, revocation toast bilan) — mos kelmaydi, alohida qoldi.
 */
export function useBranchSwitch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setTokens, setContext, clear } = useAuthStore();

  return useSwitchWorkspace({
    onSuccess: (data) => {
      // Token hamisha saqlanadi; payload decode (base64url) xato bo'lsa ham login buzilmasin.
      setTokens(data.accessToken, data.refreshToken);
      try {
        const seg = data.accessToken.split('.')[1] ?? '';
        const b64 = seg
          .replace(/-/g, '+')
          .replace(/_/g, '/')
          .padEnd(Math.ceil(seg.length / 4) * 4, '=');
        const payload = JSON.parse(atob(b64)) as {
          atid: string | null;
          abid: string | null;
          perms: string[];
          roleKey?: string | null;
        };
        setContext(payload.atid, payload.abid, payload.perms, payload.roleKey ?? null);
      } catch {
        /* malformed JWT payload — kontekst keyingi auth bootstrap'da o'rnatiladi */
      }
      // Filial-scoped data (navbat, yozilish, hisobotlar) yangi kontekstni aks ettirsin.
      queryClient.clear();
      navigate('/');
    },
    onError: (err) => {
      // Stale refresh (multi-tab yoki fon-401 rotatsiyasi) — switchWorkspace butun chain'ni
      // revoke qiladi. Bunda toast emas, toza qayta-login kerak.
      const code = err instanceof ApiError ? err.code : null;
      if (
        code === 'auth.refresh_revoked' ||
        code === 'auth.invalid_refresh' ||
        code === 'auth.refresh_mismatch'
      ) {
        clear();
        navigate('/login', { replace: true });
        return;
      }
      notifications.show({
        title: t('common.error'),
        message: err instanceof ApiError ? err.message : t('shell.branch_switch_error'),
        color: 'red',
      });
    },
  });
}
