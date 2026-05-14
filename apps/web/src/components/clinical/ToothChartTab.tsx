import type { CreateToothStateInput, ToothState } from '@dental/api-client';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { Odontogram } from './Odontogram.tsx';

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

export function ToothChartTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const canEdit = hasPermission('medical_record.edit');

  const [isPrimary, setIsPrimary] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [draftStates, setDraftStates] = useState<Map<number, ToothState>>(new Map());
  const [draftNotes, setDraftNotes] = useState('');
  const [dirty, setDirty] = useState(false);

  const chartQuery = useQuery({
    queryKey: ['tooth-chart-latest', patientId],
    queryFn: () => api.clinical.getLatestToothChart(patientId),
  });

  // Initialize draft from latest snapshot
  useEffect(() => {
    if (!chartQuery.data) return;
    const map = new Map<number, ToothState>();
    for (const s of chartQuery.data.states) {
      if (s.surface === 'whole') map.set(s.toothNumber, s.state);
    }
    setDraftStates(map);
    setIsPrimary(chartQuery.data.isPrimaryDentition);
    setDirty(false);
  }, [chartQuery.data]);

  const createMut = useMutation({
    mutationFn: () => {
      const states: CreateToothStateInput[] = Array.from(draftStates.entries()).map(
        ([n, state]) => ({
          toothNumber: n,
          state,
          surface: 'whole',
        }),
      );
      return api.clinical.createToothChart({
        patientId,
        isPrimaryDentition: isPrimary,
        notes: draftNotes || undefined,
        states,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tooth-chart-latest', patientId] });
      setDraftNotes('');
      setDirty(false);
    },
  });

  const statesArray = useMemo(() => {
    return Array.from(draftStates.entries()).map(([toothNumber, state]) => ({
      id: `draft-${toothNumber}`,
      toothChartId: 'draft',
      toothNumber,
      surface: 'whole' as const,
      state,
      diagnosisId: null,
      notes: null,
      createdAt: new Date().toISOString(),
    }));
  }, [draftStates]);

  const setToothState = (state: ToothState) => {
    if (selectedTooth === null) return;
    const next = new Map(draftStates);
    next.set(selectedTooth, state);
    setDraftStates(next);
    setDirty(true);
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('tooth_chart.title')}</Title>
        <Group>
          <Switch
            label={t('tooth_chart.primary_dentition')}
            checked={isPrimary}
            onChange={(e) => {
              setIsPrimary(e.currentTarget.checked);
              setDraftStates(new Map());
              setDirty(true);
            }}
            disabled={!canEdit}
          />
        </Group>
      </Group>

      {!chartQuery.data && !chartQuery.isLoading && (
        <Alert color="gray">{t('tooth_chart.no_chart')}</Alert>
      )}

      <Paper withBorder p="md">
        <Odontogram
          states={statesArray}
          isPrimaryDentition={isPrimary}
          selectedTooth={selectedTooth}
          onSelectTooth={setSelectedTooth}
        />
      </Paper>

      {canEdit && selectedTooth !== null && (
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Text fw={600}>
              {t('tooth_chart.selected_tooth')}: 🦷 <strong>{selectedTooth}</strong>
            </Text>
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
              onChange={(e) => {
                setDraftNotes(e.currentTarget.value);
                setDirty(true);
              }}
              rows={2}
            />
            <Group justify="flex-end">
              <Button
                onClick={() => createMut.mutate()}
                loading={createMut.isPending}
                disabled={!dirty && draftStates.size === 0}
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
