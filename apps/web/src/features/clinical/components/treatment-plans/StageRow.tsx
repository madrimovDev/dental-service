import type {
  TreatmentStage,
  TreatmentStageAcceptance,
  TreatmentStageStatus,
} from '@dental/api-client';
import { StatusPill } from '@dental/ui';
import { Box, Button, Card, Group, Select, Text } from '@mantine/core';
import { IconCheck, IconDental, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { toStageRowVM } from '../../clinical.mappers';

const STAGE_STATUSES: TreatmentStageStatus[] = ['pending', 'in_progress', 'completed', 'skipped'];

export function StageRow({
  stage,
  canEdit,
  onUpdateStage,
  onSetAcceptance,
  acceptancePending,
}: {
  stage: TreatmentStage;
  canEdit: boolean;
  onUpdateStage: (stageId: string, status: TreatmentStageStatus) => void;
  // CLI-224: acceptance — status'dan alohida o'q (qabul = qarzga kiradi).
  onSetAcceptance: (stageId: string, acceptance: TreatmentStageAcceptance) => void;
  acceptancePending: boolean;
}) {
  const { t } = useTranslation();
  const vm = toStageRowVM(stage);
  return (
    <Card withBorder padding="sm">
      <Group justify="space-between" align="flex-start">
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
            <StatusPill status={vm.acceptanceTone}>{t(vm.acceptanceLabelKey)}</StatusPill>
          </Group>
        </Box>
        <Group gap="xs" align="center">
          {canEdit && vm.acceptance !== 'accepted' && (
            <Button
              size="compact-xs"
              variant="light"
              color="teal"
              leftSection={<IconCheck size={14} />}
              loading={acceptancePending}
              onClick={() => onSetAcceptance(vm.id, 'accepted')}
            >
              {t('treatment_plan.accept')}
            </Button>
          )}
          {canEdit && vm.acceptance !== 'rejected' && (
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              leftSection={<IconX size={14} />}
              loading={acceptancePending}
              onClick={() => onSetAcceptance(vm.id, 'rejected')}
            >
              {t('treatment_plan.reject')}
            </Button>
          )}
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
      </Group>
    </Card>
  );
}
