import {
  ApiError,
  bootstrapStatus,
  getMe,
  getWorkspaceBranches,
  login,
  registerTenant,
  registrationEnabled,
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

/**
 * Bu instansiyada o'z-o'zini ro'yxatdan o'tkazish (`/register-tenant`) ochiqmi.
 * Pre-auth: token bilan GATE QILINMAYDI (`useMe` naqshidan farqli) — sahifa
 * login'dan oldin ochiladi. Instansiya rejimi sessiya davomida o'zgarmaydi,
 * shuning uchun qayta so'rovlar keraksiz.
 */
export function useRegistrationEnabled() {
  return useQuery({
    queryKey: authKeys.registrationEnabled(),
    queryFn: () => registrationEnabled().then((r) => r.data),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

/**
 * Bu o'rnatma umuman ishlashga tayyormi (audit C1): `.lic` bormi va lokal
 * bazada tenant bormi. Pre-auth — login sahifasidan OLDIN chaqiriladi
 * (`useRegistrationEnabled` pretsedenti, token bilan gate QILINMAYDI).
 *
 * `staleTime: 0` — qulflanish holati sahifa ochilganda qayta aniqlanadi;
 * keshdan eskirgan javob bilan foydalanuvchini noto'g'ri ekranda ushlab
 * qolmaslik uchun (vendor "qayta o'rnatishga tayyorlash"ni bajargach holat
 * o'zgaradi).
 *
 * `retry: false` — xato bo'lsa `data` `undefined` qoladi va iste'molchilar
 * FAIL-OPEN qiladi (forma/login ko'rinadi), tarmoq xatosi mijozni bloklamaydi.
 */
export function useBootstrapStatus() {
  return useQuery({
    queryKey: authKeys.bootstrapStatus(),
    queryFn: () => bootstrapStatus().then((r) => r.data),
    staleTime: 0,
    retry: false,
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
