import type { TreatmentPlan, TreatmentStageStatus } from '@dental/api-client';
import { StatusPill } from '@dental/ui';
import { Box, Group, Paper, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { usePlanDetail } from '../../clinical.api';
import { toPlanCardVM } from '../../clinical.mappers';
import { StageRow } from './StageRow';

export function PlanCard({
  plan,
  canEdit,
  onUpdateStage,
}: {
  plan: TreatmentPlan;
  canEdit: boolean;
  onUpdateStage: (stageId: string, status: TreatmentStageStatus) => void;
}) {
  const { t } = useTranslation();
  const vm = toPlanCardVM(plan);
  const detailQuery = usePlanDetail(plan.id);

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Box>
          <Text fw={700}>{vm.title}</Text>
          <Group gap="xs" mt={4}>
            <StatusPill status={vm.statusTone}>{t(vm.statusLabelKey)}</StatusPill>
            <Text size="sm" c="dimmed">
              {t('treatment_plan.total_cost')}: {vm.totalCostText} UZS
            </Text>
            <Text size="sm" c="dimmed">
              {t('treatment_plan.total_visits')}: {vm.totalVisits}
            </Text>
          </Group>
        </Box>
        {detailQuery.data?.stages.map((stage) => (
          <StageRow key={stage.id} stage={stage} canEdit={canEdit} onUpdateStage={onUpdateStage} />
        ))}
      </Stack>
    </Paper>
  );
}
