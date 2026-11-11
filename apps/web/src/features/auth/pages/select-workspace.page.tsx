import { ApiError } from '@dental/api-client';
import { AlertBanner, Card, StatusPill } from '@dental/ui';
import {
  Button,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { roleLabel } from '@/lib/role-label';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useAcceptInvitation,
  useDeclineInvitation,
  useInvitations,
  useMe,
  useSwitchWorkspace,
} from '../auth.api';

type WorkspaceOption = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  branchId: string | null;
  branchName: string | null;
  roleName: string;
  isOwner: boolean;
};

export function SelectWorkspacePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeTenantId, clear, setTokens, setContext } = useAuthStore();

  // Auto-select faqat bir marta ishlasin (loop oldini olish).
  const autoSelectedRef = useRef(false);

  const meQuery = useMe();
  const invitations = useInvitations();
  const acceptMut = useAcceptInvitation();
  const declineMut = useDeclineInvitation();
  const invites = invitations.data ?? [];

  const switchMut = useSwitchWorkspace({
    onSuccess: (data) => {
      // Decode JWT to get perms (simple base64 — production: jose lib)
      const payload = JSON.parse(atob(data.accessToken.split('.')[1] ?? '')) as {
        atid: string | null;
        abid: string | null;
        perms: string[];
        roleKey?: string | null;
      };
      // Switch endi yangi refresh ham qaytaradi — rotation chain'i davom etadi
      setTokens(data.accessToken, data.refreshToken);
      setContext(payload.atid, payload.abid, payload.perms, payload.roleKey ?? null);
      // CLI-407: cross-tenant stale kesh — navigatsiyadan oldin butun TanStack keshini
      // tozalaymiz (useBranchSwitch bilan bir xil tartib). Aks holda staleTime ichida
      // eski tenant ma'lumoti yangi tenantda ko'rinib qoladi.
      queryClient.clear();
      navigate('/');
    },
    onError: (err) => {
      // Refresh token o'lik bo'lsa (eski sessiya yoki race) — to'g'ridan-to'g'ri logout
      const code = err instanceof ApiError ? err.code : null;
      if (
        code === 'auth.refresh_revoked' ||
        code === 'auth.invalid_refresh' ||
        code === 'auth.refresh_mismatch'
      ) {
        notifications.show({
          title: t('auth.select_workspace.session_expired_title'),
          message: t('auth.select_workspace.session_expired_message'),
          color: 'red',
        });
        clear();
        navigate('/login', { replace: true });
        return;
      }
      // Boshqa xatolar uchun — error toast + autoSelect qayta urinishini tiyish
      notifications.show({
        title: t('common.error'),
        message: err instanceof ApiError ? err.message : t('auth.select_workspace.switch_failed'),
        color: 'red',
      });
      // autoSelectedRef ni TRUE qoldiramiz — auto qayta urinmaslik
    },
  });

  // Auto-select if single workspace — useRef bilan faqat 1 marta.
  // ⚠️ FAQAT login'dan keyin (active workspace HALI yo'q). Agar foydalanuvchi allaqachon
  // workspace'da bo'lib, "workspace almashtirish"ni QASDDAN bossa — avto-redirect QILMAYMIZ,
  // aks holda sahifa darhol bosh ekranga qaytib "ochilmaydi"dek tuyuladi (CLI-157). Filial
  // almashtirish endi Topbar dropdown'da — bu sahifa faqat tenant tanlash uchun.
  // biome-ignore lint/correctness/useExhaustiveDependencies: switchMut stable mutate ishlatamiz
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (activeTenantId) return; // allaqachon workspace tanlangan — qasddan kelgan, ko'rsatamiz
    if (switchMut.isPending) return; // qo'l bilan tanlash davom etmoqda — auto qo'shilmasin
    if (!meQuery.data) return;
    // FU-08: kutilayotgan taklif bo'lsa avto-redirect QILMAYMIZ — aks holda bitta
    // workspace'li foydalanuvchi taklifni hech qachon ko'rmaydi (brauzer sinovi topilmasi).
    if (invitations.isLoading) return;
    if ((invitations.data ?? []).length > 0) return;
    const options = collectOptions(meQuery.data);
    if (options.length === 1 && options[0]) {
      autoSelectedRef.current = true;
      switchMut.mutate({
        tenantId: options[0].tenantId,
        branchId: options[0].branchId ?? undefined,
      });
    }
  }, [meQuery.data, invitations.data, invitations.isLoading]);

  if (meQuery.isLoading) {
    return (
      <Container size={500} py={80}>
        <Stack align="center">
          <Loader />
          <Text c="dimmed">{t('common.loading')}</Text>
        </Stack>
      </Container>
    );
  }

  const options = meQuery.data ? collectOptions(meQuery.data) : [];

  return (
    <Container size={500} py={60}>
      <Title order={2} ta="center" mb="lg">
        {t('auth.select_workspace.title')}
      </Title>

      {options.length === 0 && (
        <AlertBanner tier={2}>{t('auth.select_workspace.no_workspaces')}</AlertBanner>
      )}

      {invites.length > 0 && (
        <Stack gap="sm" mb="lg">
          <Title order={4}>{t('auth.invitations.title')}</Title>
          {invites.map((inv) => (
            <Card key={inv.id}>
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={4}>
                  <Group gap="xs">
                    <Text fw={600}>{inv.tenantName}</Text>
                    <StatusPill status="waiting">{t('settings.users.pending')}</StatusPill>
                  </Group>
                  <Text size="sm" c="var(--text-2)">
                    {inv.branchName ?? t('auth.select_workspace.all_branches')} ·{' '}
                    {roleLabel(inv.roleName, t)}
                  </Text>
                </Stack>
                <Group gap="xs" wrap="nowrap">
                  <Button
                    size="xs"
                    loading={acceptMut.isPending}
                    onClick={() =>
                      acceptMut.mutate(inv.id, {
                        onSuccess: () =>
                          notifications.show({
                            message: t('auth.invitations.accepted'),
                            color: 'teal',
                          }),
                      })
                    }
                  >
                    {t('auth.invitations.accept')}
                  </Button>
                  <Button
                    size="xs"
                    variant="default"
                    loading={declineMut.isPending}
                    onClick={() => declineMut.mutate(inv.id)}
                  >
                    {t('auth.invitations.decline')}
                  </Button>
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Stack gap="sm">
        {options.map((opt) => (
          <UnstyledButton
            key={`${opt.tenantId}-${opt.branchId ?? 'all'}-${opt.roleName}`}
            onClick={() => {
              if (switchMut.isPending) return;
              switchMut.mutate({
                tenantId: opt.tenantId,
                branchId: opt.branchId ?? undefined,
              });
            }}
            disabled={switchMut.isPending}
          >
            <Card>
              <Group justify="space-between">
                <Stack gap={2}>
                  <Text fw={600}>{opt.tenantName}</Text>
                  <Text size="sm" c="var(--text-2)">
                    {opt.branchName ?? t('auth.select_workspace.all_branches')} ·{' '}
                    {roleLabel(opt.roleName, t)}
                  </Text>
                </Stack>
                {opt.isOwner && (
                  <StatusPill status="confirmed">
                    {t('auth.select_workspace.owner_badge')}
                  </StatusPill>
                )}
              </Group>
            </Card>
          </UnstyledButton>
        ))}
      </Stack>
    </Container>
  );
}

function collectOptions(me: {
  assignments: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    branchId: string | null;
    branchName: string | null;
    roleName: string;
    isOwner: boolean;
  }>;
  ownerTenants: Array<{ tenantId: string; tenantName: string; tenantSlug: string }>;
}): WorkspaceOption[] {
  const opts: WorkspaceOption[] = [];

  // Add explicit assignments
  for (const a of me.assignments) {
    opts.push({
      tenantId: a.tenantId,
      tenantName: a.tenantName,
      tenantSlug: a.tenantSlug,
      branchId: a.branchId,
      branchName: a.branchName,
      roleName: a.roleName,
      isOwner: a.isOwner,
    });
  }

  // Add owner tenants that are NOT already in assignments
  const tenantIdsWithAssignments = new Set(opts.map((o) => o.tenantId));
  for (const ot of me.ownerTenants) {
    if (!tenantIdsWithAssignments.has(ot.tenantId)) {
      opts.push({
        tenantId: ot.tenantId,
        tenantName: ot.tenantName,
        tenantSlug: ot.tenantSlug,
        branchId: null,
        branchName: null,
        roleName: 'Owner',
        isOwner: true,
      });
    }
  }

  return opts;
}
