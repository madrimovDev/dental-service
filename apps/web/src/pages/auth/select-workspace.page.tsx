import {
  Alert,
  Badge,
  Card,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

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
  const { accessToken, setTokens, setContext } = useAuthStore();

  // Auto-select faqat bir marta ishlasin (loop oldini olish).
  const autoSelectedRef = useRef(false);

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.auth.me(),
    enabled: !!accessToken,
  });

  const switchMut = useMutation({
    mutationFn: (input: { tenantId: string; branchId?: string }) => {
      const rt = useAuthStore.getState().refreshToken;
      if (!rt) throw new Error('No refresh token');
      return api.auth.switchWorkspace({ ...input, refreshToken: rt });
    },
    onSuccess: (data) => {
      // Decode JWT to get perms (simple base64 — production: jose lib)
      const payload = JSON.parse(atob(data.accessToken.split('.')[1] ?? '')) as {
        atid: string | null;
        abid: string | null;
        perms: string[];
      };
      // Switch endi yangi refresh ham qaytaradi — rotation chain'i davom etadi
      setTokens(data.accessToken, data.refreshToken);
      setContext(payload.atid, payload.abid, payload.perms);
      navigate('/');
    },
    onError: () => {
      // Auto-select fail bo'lsa, foydalanuvchi qo'lda tanlay olsin
      autoSelectedRef.current = false;
    },
  });

  // Auto-select if single workspace — useRef bilan faqat 1 marta
  // biome-ignore lint/correctness/useExhaustiveDependencies: switchMut stable mutate ishlatamiz
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (!meQuery.data) return;
    const options = collectOptions(meQuery.data);
    if (options.length === 1 && options[0]) {
      autoSelectedRef.current = true;
      switchMut.mutate({
        tenantId: options[0].tenantId,
        branchId: options[0].branchId ?? undefined,
      });
    }
  }, [meQuery.data]);

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
        <Alert color="yellow" variant="light">
          {t('auth.select_workspace.no_workspaces')}
        </Alert>
      )}

      <Stack gap="sm">
        {options.map((opt) => (
          <UnstyledButton
            key={`${opt.tenantId}-${opt.branchId ?? 'all'}-${opt.roleName}`}
            onClick={() =>
              switchMut.mutate({
                tenantId: opt.tenantId,
                branchId: opt.branchId ?? undefined,
              })
            }
            disabled={switchMut.isPending}
          >
            <Card withBorder padding="md" radius="md">
              <Group justify="space-between">
                <Stack gap={2}>
                  <Text fw={600}>{opt.tenantName}</Text>
                  <Text size="sm" c="dimmed">
                    {opt.branchName ?? t('auth.select_workspace.all_branches')} · {opt.roleName}
                  </Text>
                </Stack>
                {opt.isOwner && <Badge color="teal">Owner</Badge>}
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
