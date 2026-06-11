import type { TreatmentStage, TreatmentStageStatus } from '@dental/api-client';
import { StatusPill } from '@dental/ui';
import { Box, Card, Group, Select, Text } from '@mantine/core';
import { IconDental } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { toStageRowVM } from '../../clinical.mappers';

const STAGE_STATUSES: TreatmentStageStatus[] = ['pending', 'in_progress', 'completed', 'skipped'];

export function StageRow({
  stage,
  canEdit,
  onUpdateStage,
}: {
  stage: TreatmentStage;
  canEdit: boolean;
  onUpdateStage: (stageId: string, status: TreatmentStageStatus) => void;
}) {
  const { t } = useTranslation();
  const vm = toStageRowVM(stage);
  return (
    <Card withBorder padding="sm">
      <Group justify="space-between">
        <Box>
          <Text fw={500}>
            #{vm.sequence}. {vm.serviceName}
          </Text>
          <Group gap="xs">
            {vm.toothNumbers.length > 0 && (
              <Group gap={4}>
                <IconDental size={14} />
                <Text size="sm" c="dimmed">
                  {vm.toothNumbers.join(', ')}
                </Text>
              </Group>
            )}
            <Text size="sm" c="dimmed">
              {vm.costText} {t('common.currency')}
            </Text>
            <StatusPill status={vm.statusTone}>{t(vm.statusLabelKey)}</StatusPill>
          </Group>
        </Box>
        {canEdit && (
          <Select
            size="xs"
            w={140}
            value={vm.status}
            onChange={(v) => v && onUpdateStage(vm.id, v as TreatmentStageStatus)}
            data={STAGE_STATUSES.map((s) => ({
              value: s,
              label: t(`treatment_plan.stage_status_${s}`),
            }))}
          />
        )}
      </Group>
    </Card>
  );
}
