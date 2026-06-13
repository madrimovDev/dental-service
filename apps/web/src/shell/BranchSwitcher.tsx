import { ApiError, getWorkspaceBranches, switchWorkspace } from '@dental/api-client';
import { Menu } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import classes from './Topbar.module.css';

/**
 * Topbar filial almashtirgich — joriy tenant ichida filiallar orasida o'tish.
 * Workspace (tenant) almashtirishdan ALOHIDA: bu faqat `abid` (branch) ni o'zgartiradi.
 * Manba — RBAC-safe `GET /auth/workspace-branches` (CLI-157).
 * Tanlash uchun 0–1 variant bo'lsa (bitta filial, "barcha" yo'q) — ko'rsatilmaydi.
 */
export function BranchSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeTenantId, activeBranchId, setTokens, setContext, clear } = useAuthStore();

  const branchesQuery = useQuery({
    queryKey: ['auth', 'workspace-branches', activeTenantId],
    queryFn: () => getWorkspaceBranches().then((r) => r.data),
    enabled: !!activeTenantId,
  });

  const switchMut = useMutation({
    mutationFn: (branchId: string | undefined) => {
      const rt = useAuthStore.getState().refreshToken;
      if (!activeTenantId || !rt) throw new Error('No active workspace');
      return switchWorkspace({ tenantId: activeTenantId, branchId, refreshToken: rt }).then(
        (r) => r.data,
      );
    },
    onSuccess: (data) => {
      const payload = JSON.parse(atob(data.accessToken.split('.')[1] ?? '')) as {
        atid: string | null;
        abid: string | null;
        perms: string[];
        roleKey?: string | null;
      };
      setTokens(data.accessToken, data.refreshToken);
      setContext(payload.atid, payload.abid, payload.perms, payload.roleKey ?? null);
      // Filial-scoped data (navbat, yozilish, hisobotlar) yangi kontekstni aks ettirsin.
      queryClient.clear();
      navigate('/');
    },
    onError: (err) => {
      // Stale refresh (multi-tab yoki fon-401 rotatsiyasi) — switchWorkspace butun chain'ni
      // revoke qiladi. Bunda toast emas, toza qayta-login kerak (SelectWorkspacePage bilan bir xil).
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

  const data = branchesQuery.data;
  const totalChoices = (data?.branches.length ?? 0) + (data?.allowAllBranches ? 1 : 0);
  // Tanlov yo'q — switcher'ni umuman ko'rsatmaymiz.
  if (!data || totalChoices <= 1) return null;

  const currentName = activeBranchId
    ? (data.branches.find((b) => b.id === activeBranchId)?.name ?? t('shell.select_branch'))
    : t('shell.all_branches');

  return (
    <Menu shadow="md" width={220} position="bottom-start">
      <Menu.Target>
        <button
          type="button"
          className={classes.branch}
          disabled={switchMut.isPending}
          aria-label={t('shell.select_branch')}
        >
          <Building2 size={16} />
          <span>{currentName}</span>
          <ChevronDown size={14} />
        </button>
      </Menu.Target>
      <Menu.Dropdown>
        {data.allowAllBranches && (
          <Menu.Item
            leftSection={!activeBranchId ? <Check size={16} /> : <span style={{ width: 16 }} />}
            onClick={() => activeBranchId && switchMut.mutate(undefined)}
          >
            {t('shell.all_branches')}
          </Menu.Item>
        )}
        {data.branches.map((b) => (
          <Menu.Item
            key={b.id}
            leftSection={
              activeBranchId === b.id ? <Check size={16} /> : <span style={{ width: 16 }} />
            }
            onClick={() => activeBranchId !== b.id && switchMut.mutate(b.id)}
          >
            {b.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
