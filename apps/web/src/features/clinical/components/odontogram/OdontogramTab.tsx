import type {
  CreateToothStateInput,
  ToothState,
  ToothStateEntry,
  ToothSurface,
} from '@dental/api-client';
import { StateView } from '@dental/ui';
import {
  Alert,
  Badge,
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
import { IconArrowBack, IconDental, IconHistory } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useCreateToothChart,
  useDiagnoses,
  useLatestToothChart,
  useToothChartHistory,
} from '../../clinical.api';
import {
  draftMapToCreateInput,
  EMPTY_TOOTH_DRAFT,
  toDiagnosisOptions,
  toToothDraftMap,
} from '../../clinical.mappers';
import type { ToothDraftMap } from '../../clinical.types';
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

const SURFACE_OPTIONS: ToothSurface[] = ['whole', 'M', 'D', 'B', 'L', 'O', 'I'];

export function OdontogramTab({ patientId }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ru' ? 'ru' : 'uz';
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission('medical_record.edit');

  const chartQuery = useLatestToothChart(patientId);
  const historyQuery = useToothChartHistory(patientId);
  const diagnosesQuery = useDiagnoses();
  const createMut = useCreateToothChart(patientId);

  const [isPrimary, setIsPrimary] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [draft, setDraft] = useState<ToothDraftMap>(new Map());
  const [draftNotes, setDraftNotes] = useState('');
  // CLI-191: tarix — tanlangan eski snapshot id (null = hozirgi/tahrirlash rejimi).
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    if (!chartQuery.data) return;
    setDraft(toToothDraftMap(chartQuery.data));
    setIsPrimary(chartQuery.data.isPrimaryDentition);
  }, [chartQuery.data]);

  const diagnosisOptions = useMemo(
    () => (diagnosesQuery.data ? toDiagnosisOptions(diagnosesQuery.data, lang) : []),
    [diagnosesQuery.data, lang],
  );

  // CLI-191: ko'rilayotgan eski snapshot (mavjud bo'lsa) — read-only.
  const viewingSnapshot = useMemo(
    () => historyQuery.data?.find((ch) => ch.id === viewingId) ?? null,
    [historyQuery.data, viewingId],
  );

  // Odontogram'da ko'rsatiladigan holat: read-only snapshot bo'lsa undan, aks holda draft'dan.
  const displayMap = useMemo<ToothDraftMap>(
    () => (viewingSnapshot ? toToothDraftMap(viewingSnapshot) : draft),
    [viewingSnapshot, draft],
  );

  const statesArray: ToothStateEntry[] = useMemo(
    () =>
      Array.from(displayMap.entries()).map(([toothNumber, d]) => ({
        id: `draft-${toothNumber}`,
        toothChartId: 'draft',
        toothNumber,
        surface: d.surface,
        state: d.state,
        diagnosisId: d.diagnosisId,
        notes: null,
        createdAt: new Date().toISOString(),
      })),
    [displayMap],
  );

  const isReadOnly = viewingSnapshot !== null;
  const current = selectedTooth !== null ? (draft.get(selectedTooth) ?? null) : null;

  const patchTooth = (patch: Partial<ReturnType<typeof EMPTY_TOOTH_DRAFT>>) => {
    if (selectedTooth === null) return;
    const next = new Map(draft);
    const base = next.get(selectedTooth) ?? EMPTY_TOOTH_DRAFT();
    next.set(selectedTooth, { ...base, ...patch });
    setDraft(next);
  };

  const historyOptions =
    historyQuery.data?.map((ch) => ({
      value: ch.id,
      label: new Date(ch.createdAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-UZ'),
    })) ?? [];

  const save = () => {
    const states: CreateToothStateInput[] = draftMapToCreateInput(draft);
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
        <Group gap="sm">
          {/* CLI-191: snapshot tarix tanlovi */}
          {historyOptions.length > 0 && (
            <Select
              leftSection={<IconHistory size={16} />}
              placeholder={t('tooth_chart.view_history')}
              data={historyOptions}
              value={viewingId}
              onChange={setViewingId}
              clearable
              w={240}
              comboboxProps={{ withinPortal: true }}
            />
          )}
          <Switch
            label={t('tooth_chart.primary_dentition')}
            checked={isPrimary}
            onChange={(e) => {
              setIsPrimary(e.currentTarget.checked);
              setDraft(new Map());
              setSelectedTooth(null);
            }}
            disabled={!canEdit || isReadOnly}
          />
        </Group>
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

      {isReadOnly && (
        <Alert
          color="blue"
          icon={<IconHistory size={18} />}
          withCloseButton
          onClose={() => setViewingId(null)}
        >
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">{t('tooth_chart.viewing_snapshot')}</Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconArrowBack size={14} />}
              onClick={() => setViewingId(null)}
            >
              {t('tooth_chart.return_to_current')}
            </Button>
          </Group>
        </Alert>
      )}

      <Paper withBorder p="md">
        <Odontogram
          states={statesArray}
          isPrimaryDentition={isReadOnly ? viewingSnapshot.isPrimaryDentition : isPrimary}
          selectedTooth={isReadOnly ? null : selectedTooth}
          onSelectTooth={(n) => {
            if (!isReadOnly) setSelectedTooth(n);
          }}
        />
      </Paper>

      {canEdit && !isReadOnly && selectedTooth !== null && (
        <Paper withBorder p="md">
          <Stack gap="sm">
            <Group gap={6}>
              <IconDental size={18} />
              <Text fw={600}>
                {t('tooth_chart.selected_tooth')}: <strong>{selectedTooth}</strong>
              </Text>
            </Group>
            <Group grow align="flex-start">
              <Select
                label={t('tooth_chart.set_state')}
                value={current?.state ?? 'healthy'}
                onChange={(v) => v && patchTooth({ state: v as ToothState })}
                data={TOOTH_STATE_OPTIONS.map((s) => ({
                  value: s,
                  label: t(`tooth_chart.states.${s}`),
                }))}
                comboboxProps={{ withinPortal: true }}
              />
              <Select
                label={t('tooth_chart.set_surface')}
                value={current?.surface ?? 'whole'}
                onChange={(v) => v && patchTooth({ surface: v as ToothSurface })}
                data={SURFACE_OPTIONS.map((s) => ({
                  value: s,
                  label: t(`tooth_chart.surfaces.${s}`),
                }))}
                comboboxProps={{ withinPortal: true }}
              />
            </Group>
            <Select
              label={t('tooth_chart.set_diagnosis')}
              placeholder={t('tooth_chart.diagnosis_placeholder')}
              value={current?.diagnosisId ?? null}
              onChange={(v) => patchTooth({ diagnosisId: v })}
              data={diagnosisOptions}
              searchable
              clearable
              nothingFoundMessage={t('tooth_chart.no_diagnosis')}
              comboboxProps={{ withinPortal: true }}
            />
          </Stack>
        </Paper>
      )}

      {canEdit && !isReadOnly && (
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
              <Button onClick={save} loading={createMut.isPending} disabled={draft.size === 0}>
                {t('tooth_chart.save_snapshot')}
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}

      {isReadOnly && viewingSnapshot.notes && (
        <Paper withBorder p="md">
          <Group gap={6}>
            <Badge variant="light" color="blue">
              {t('treatment_plan.notes')}
            </Badge>
            <Text size="sm">{viewingSnapshot.notes}</Text>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}
