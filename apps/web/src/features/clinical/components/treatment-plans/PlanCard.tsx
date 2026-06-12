import type { TreatmentPlanWithStages, TreatmentStageStatus } from '@dental/api-client';
import { StatusPill } from '@dental/ui';
import { Box, Group, Paper, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { toPlanCardVM } from '../../clinical.mappers';
import { StageRow } from './StageRow';

export function PlanCard({
  plan,
  canEdit,
  onUpdateStage,
}: {
  // CLI-114: stage'lar endi list javobida keladi (har kartada usePlanDetail YO'Q).
  plan: TreatmentPlanWithStages;
  canEdit: boolean;
  onUpdateStage: (stageId: string, status: TreatmentStageStatus) => void;
}) {
  const { t } = useTranslation();
  const vm = toPlanCardVM(plan);

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Box>
          <Text fw={700}>{vm.title}</Text>
          <Group gap="xs" mt={4}>
            <StatusPill status={vm.statusTone}>{t(vm.statusLabelKey)}</StatusPill>
            <Text size="sm" c="dimmed">
              {t('treatment_plan.total_cost')}: {vm.totalCostText} {t('common.currency')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('treatment_plan.total_visits')}: {vm.totalVisits}
            </Text>
          </Group>
        </Box>
        {plan.stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} canEdit={canEdit} onUpdateStage={onUpdateStage} />
        ))}
      </Stack>
    </Paper>
  );
}
