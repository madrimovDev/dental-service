import type { TreatmentStageStatus } from '@dental/api-client';
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useCreatePlan, useTreatmentPlans, useUpdateStage } from '../../clinical.api';
import { PlanCard } from './PlanCard';
import { PlanFormModal } from './PlanFormModal';

type Props = { patientId: string };

export function TreatmentPlansTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuthStore();
  const [opened, { open, close }] = useDisclosure(false);
  const canEdit = hasPermission('medical_record.edit');

  const plansQuery = useTreatmentPlans(patientId);
  const createMut = useCreatePlan(patientId);
  const updateStageMut = useUpdateStage(patientId);

  const onUpdateStage = (id: string, status: TreatmentStageStatus) =>
    updateStageMut.mutate({ id, status });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('treatment_plan.title')}</Title>
        {canEdit && (
          <Button leftSection={<IconPlus size={16} />} onClick={open}>
            {t('treatment_plan.create')}
          </Button>
        )}
      </Group>

      {plansQuery.isLoading && <Text>{t('common.loading')}</Text>}
      {!plansQuery.isLoading && plansQuery.data?.length === 0 && (
        <Paper withBorder p="md">
          <Text c="dimmed">{t('treatment_plan.empty')}</Text>
        </Paper>
      )}

      {plansQuery.data?.map((plan) => (
        <PlanCard key={plan.id} plan={plan} canEdit={canEdit} onUpdateStage={onUpdateStage} />
      ))}

      {user && (
        <PlanFormModal
          opened={opened}
          onClose={close}
          patientId={patientId}
          doctorId={user.id}
          pending={createMut.isPending}
          onCreate={(body) => createMut.mutate(body, { onSuccess: close })}
        />
      )}
    </Stack>
  );
}
