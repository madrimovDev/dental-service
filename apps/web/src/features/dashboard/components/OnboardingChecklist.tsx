import { Card } from '@dental/ui';
import { ActionIcon, Group, Progress, Stack, Text } from '@mantine/core';
import { Check, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useServices } from '@/features/services/services.api.ts';
import {
  useBranches,
  useTenantSettings,
  useUpdateTenantSettings,
  useUsers,
} from '@/features/settings/settings.api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { buildOnboardingSteps, isOnboardingComplete } from '../onboarding.ts';

export function OnboardingChecklist() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const settingsQuery = useTenantSettings();
  const settings = settingsQuery.data;
  const update = useUpdateTenantSettings();
  const branches = useBranches();
  const services = useServices();
  const users = useUsers();

  if (!hasPermission('tenant_settings.edit')) return null;
  // Settings yuklanmaguncha yashir — aks holda dismiss qilingan karta har yuklanishda miltillaydi.
  if (settingsQuery.isLoading) return null;
  if (settings?.onboardingDismissedAt) return null;

  const steps = buildOnboardingSteps({
    t,
    branches: branches.data?.length ?? 0,
    services: services.data?.length ?? 0,
    staff: users.data?.length ?? 0,
  });
  if (isOnboardingComplete(steps)) return null;

  const doneCount = steps.filter((s) => s.done).length;
  const dismiss = () => update.mutate({ onboardingDismissedAt: new Date().toISOString() });

  return (
    <Card
      title={t('onboarding.title')}
      actions={
        <ActionIcon variant="subtle" aria-label={t('onboarding.dismiss')} onClick={dismiss}>
          <X size={16} />
        </ActionIcon>
      }
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t('onboarding.subtitle')}
        </Text>
        <Progress value={(doneCount / steps.length) * 100} />
        <Stack gap="xs">
          {steps.map((s) => (
            <Group
              key={s.id}
              justify="space-between"
              wrap="nowrap"
              onClick={() => !s.done && navigate(s.path)}
              style={{ cursor: s.done ? 'default' : 'pointer' }}
            >
              <Group gap="sm" wrap="nowrap">
                {s.done ? (
                  <Check size={16} color="var(--mantine-color-teal-6)" />
                ) : (
                  <ChevronRight size={16} />
                )}
                <div>
                  <Text fw={600} size="sm" td={s.done ? 'line-through' : undefined}>
                    {s.label}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {s.description}
                  </Text>
                </div>
              </Group>
            </Group>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}
