import type { CreateToothStateInput, ToothState, ToothStateEntry } from '@dental/api-client';
import { StateView } from '@dental/ui';
import {
  Alert,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconDental } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useCreateToothChart, useLatestToothChart } from '../../clinical.api';
import { draftStatesToCreateInput, toToothStateMap } from '../../clinical.mappers';
import { Odontogram } from './Odontogram';

type Props = { patientId: string };

const TOOTH_STATE_OPTIONS: ToothState[] = [
  'healthy',
  'caries',
  'filling',
  'crown',
  'implant',
  'missing',
  'root_canal',
  'to_extract',
  'temporary',
  'veneer',
];

export function OdontogramTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission('medical_record.edit');

  const chartQuery = useLatestToothChart(patientId);
  const createMut = useCreateToothChart(patientId);

  const [isPrimary, setIsPrimary] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [draftStates, setDraftStates] = useState<Map<number, ToothState>>(new Map());
  const [draftNotes, setDraftNotes] = useState('');

  useEffect(() => {
    if (!chartQuery.data) return;
    setDraftStates(toToothStateMap(chartQuery.data));
    setIsPrimary(chartQuery.data.isPrimaryDentition);
  }, [chartQuery.data]);

  const statesArray: ToothStateEntry[] = useMemo(
    () =>
      Array.from(draftStates.entries()).map(([toothNumber, state]) => ({
        id: `draft-${toothNumber}`,
        toothChartId: 'draft',
        toothNumber,
        surface: 'whole' as const,
        state,
        diagnosisId: null,
        notes: null,
        createdAt: new Date().toISOString(),
      })),
    [draftStates],
  );

  const selectTooth = (n: number) => {
    setSelectedTooth(n);
  };

  const setToothState = (state: ToothState) => {
    if (selectedTooth === null) return;
    const next = new Map(draftStates);
    next.set(selectedTooth, state);
    setDraftStates(next);
  };

  const save = () => {
    const states: CreateToothStateInput[] = draftStatesToCreateInput(draftStates);
    createMut.mutate(
      { patientId, isPrimaryDentition: isPrimary, notes: draftNotes || undefined, states },
      {
        onSuccess: () => {
          setDraftNotes('');
        },
      },
    );
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('tooth_chart.title')}</Title>
        <Switch
          label={t('tooth_chart.primary_dentition')}
          checked={isPrimary}
          onChange={(e) => {
            setIsPrimary(e.currentTarget.checked);
            setDraftStates(new Map());
            setSelectedTooth(null);
          }}
          disabled={!canEdit}
        />
      </Group>

      {chartQuery.isError && (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => chartQuery.refetch()}
        />
      )}

      {!chartQuery.data && !chartQuery.isLoading && !chartQuery.isError && (
        <Alert color="gray">{t('tooth_chart.no_chart')}</Alert>
      )}

      <Paper withBorder p="md">
        <Odontogram
          states={statesArray}
          isPrimaryDentition={isPrimary}
          selectedTooth={selectedTooth}
          onSelectTooth={selectTooth}
        />
      </Paper>

      {canEdit && selectedTooth !== null && (
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Group gap={6}>
              <IconDental size={18} />
              <Text fw={600}>
                {t('tooth_chart.selected_tooth')}: <strong>{selectedTooth}</strong>
              </Text>
            </Group>
            <Select
              label={t('tooth_chart.set_state')}
              value={draftStates.get(selectedTooth) ?? 'healthy'}
              onChange={(v) => v && setToothState(v as ToothState)}
              data={TOOTH_STATE_OPTIONS.map((s) => ({
                value: s,
                label: t(`tooth_chart.states.${s}`),
              }))}
            />
          </Stack>
        </Paper>
      )}

      {canEdit && (
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Textarea
              label={t('treatment_plan.notes')}
              placeholder={t('tooth_chart.notes_placeholder')}
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.currentTarget.value)}
              rows={2}
            />
            <Group justify="flex-end">
              <Button
                onClick={save}
                loading={createMut.isPending}
                disabled={draftStates.size === 0}
              >
                {t('tooth_chart.save_snapshot')}
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
