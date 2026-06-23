import type {
  TreatmentStage,
  TreatmentStageAcceptance,
  TreatmentStageStatus,
} from '@dental/api-client';
import { Mono, StatusPill } from '@dental/ui';
import { Button, Group, Select } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { toStageRowVM } from '../../clinical.mappers';
import classes from './StageRow.module.css';

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
    <div className={classes.row}>
      <div className={classes.cellNum}>
        <Mono>{vm.sequence}</Mono>
      </div>

      <div className={classes.cellStage}>
        <span className={classes.serviceName}>{vm.serviceName}</span>
        <div className={classes.chips}>
          <StatusPill status={vm.statusTone}>{t(vm.statusLabelKey)}</StatusPill>
          <StatusPill status={vm.acceptanceTone}>{t(vm.acceptanceLabelKey)}</StatusPill>
        </div>
      </div>

      <div className={classes.cellTooth}>
        {vm.toothNumbers.length > 0 ? <Mono>{vm.toothNumbers.join(', ')}</Mono> : '—'}
      </div>

      <div className={classes.cellCost}>
        <Mono>{vm.costText}</Mono>
      </div>

      <div className={classes.cellActions}>
        {canEdit && (
          <Group gap={6} align="center" justify="flex-end" wrap="nowrap">
            {vm.acceptance !== 'accepted' && (
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
            {vm.acceptance !== 'rejected' && (
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
            <Select
              size="xs"
              w={132}
              value={vm.status}
              onChange={(v) => v && onUpdateStage(vm.id, v as TreatmentStageStatus)}
              data={STAGE_STATUSES.map((s) => ({
                value: s,
                label: t(`treatment_plan.stage_status_${s}`),
              }))}
            />
          </Group>
        )}
      </div>
    </div>
  );
}
