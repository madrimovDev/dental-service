import type {
  CreateToothStateInput,
  ToothState,
  ToothStateEntry,
  ToothSurface,
} from '@dental/api-client';
import { Mono, StateView } from '@dental/ui';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { IconArrowBack, IconHistory } from '@tabler/icons-react';
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
import { STATUS, statusFill, ToothCell } from './ToothCell';

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

const SURFACE_OPTIONS: ToothSurface[] = ['whole', 'B', 'M', 'O', 'D', 'L', 'I'];

// Detail panel "Yuzalar" qatorlari (whole'siz — 6 anatomik yuza).
const SURFACE_FACES: Exclude<ToothSurface, 'whole'>[] = ['B', 'M', 'O', 'D', 'L', 'I'];

function quadrantKey(n: number): 'upper_right' | 'upper_left' | 'lower_right' | 'lower_left' {
  const q = Math.floor(n / 10);
  if (q === 1 || q === 5) return 'upper_right';
  if (q === 2 || q === 6) return 'upper_left';
  if (q === 4 || q === 8) return 'lower_right';
  return 'lower_left';
}

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
  const currentState = current?.state ?? 'healthy';
  const currentSurface = current?.surface ?? 'whole';

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

      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 280px',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <Paper
          withBorder
          p="md"
          style={{
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-sm)',
            background: 'var(--surface)',
          }}
        >
          <Odontogram
            states={statesArray}
            isPrimaryDentition={isReadOnly ? viewingSnapshot.isPrimaryDentition : isPrimary}
            selectedTooth={isReadOnly ? null : selectedTooth}
            onSelectTooth={(n) => {
              if (!isReadOnly) setSelectedTooth(n);
            }}
          />
        </Paper>

        {/* Detail panel (o'ng ustun) */}
        {selectedTooth !== null && !isReadOnly && (
          <Paper
            withBorder
            p="md"
            style={{
              borderRadius: 'var(--radius-card)',
              boxShadow: 'var(--shadow-sm)',
              background: 'var(--surface)',
            }}
          >
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Box>
                  <Mono>
                    <Text span style={{ fontSize: 30, fontWeight: 700, color: 'var(--ink)' }}>
                      {selectedTooth}
                    </Text>
                  </Mono>
                  <Text style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                    {t(`tooth_chart.${quadrantKey(selectedTooth)}`)}
                  </Text>
                </Box>
                {/* Status chip: swatch + label (matn doim --surface ustida --ink-2 — WCAG AA) */}
                <Group
                  gap={6}
                  wrap="nowrap"
                  style={{
                    padding: '4px 10px 4px 8px',
                    borderRadius: 'var(--radius-pill, 99px)',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-2)',
                  }}
                >
                  <Box
                    style={{
                      position: 'relative',
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: statusFill(currentState),
                      border:
                        STATUS[currentState].fill === 'empty'
                          ? '1.5px solid var(--border-strong)'
                          : '1px solid var(--border)',
                    }}
                  >
                    {STATUS[currentState].mark === 'x' && (
                      <Text
                        span
                        style={{
                          fontSize: 9,
                          lineHeight: 1,
                          color: 'var(--ink-3)',
                          fontWeight: 700,
                        }}
                      >
                        ✕
                      </Text>
                    )}
                    {STATUS[currentState].mark === 'extract' && (
                      <Text
                        span
                        style={{
                          fontSize: 9,
                          lineHeight: 1,
                          color: 'var(--text-on-danger)',
                          fontWeight: 700,
                        }}
                      >
                        ✕
                      </Text>
                    )}
                  </Box>
                  <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
                    {t(`tooth_chart.states.${currentState}`)}
                  </Text>
                </Group>
              </Group>

              <Group justify="center">
                <ToothCell
                  number={selectedTooth}
                  state={currentState}
                  selected={false}
                  onClick={() => {}}
                  size={108}
                  readOnly
                />
              </Group>

              <Box>
                <Text
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--ink-3)',
                    fontWeight: 600,
                    marginBottom: 6,
                  }}
                >
                  {t('tooth_chart.set_surface')}
                </Text>
                <Stack gap={4}>
                  {SURFACE_FACES.map((face) => {
                    const isActive = currentSurface === face;
                    return (
                      <Group key={face} justify="space-between" gap="xs" wrap="nowrap">
                        <Group gap={6} wrap="nowrap">
                          <Mono>
                            <Text
                              span
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                color: 'var(--ink-2)',
                                minWidth: 12,
                                display: 'inline-block',
                              }}
                            >
                              {face}
                            </Text>
                          </Mono>
                          <Text style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                            {t(`tooth_chart.surfaces.${face}`)}
                          </Text>
                        </Group>
                        <Text style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                          {isActive
                            ? t(`tooth_chart.states.${currentState}`)
                            : t('tooth_chart.states.healthy')}
                        </Text>
                      </Group>
                    );
                  })}
                </Stack>
              </Box>
            </Stack>
          </Paper>
        )}
      </Box>

      {/* Editor: surfPicker + statusPalette + diagnoz */}
      {canEdit && !isReadOnly && selectedTooth !== null && (
        <Paper
          withBorder
          p="md"
          style={{
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-sm)',
            background: 'var(--surface)',
          }}
        >
          <Stack gap="md">
            <Group gap={6}>
              <Mono>
                <Text span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                  {selectedTooth}
                </Text>
              </Mono>
              <Text fw={600}>{t('tooth_chart.selected_tooth')}</Text>
            </Group>

            {/* surfPicker toggle */}
            <Box>
              <Text
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ink-3)',
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {t('tooth_chart.set_surface')}
              </Text>
              <Group gap={6} wrap="wrap" role="group" aria-label={t('tooth_chart.set_surface')}>
                {SURFACE_OPTIONS.map((s) => {
                  const isActive = currentSurface === s;
                  const label = s === 'whole' ? t('tooth_chart.surfaces.whole') : s;
                  return (
                    <UnstyledButton
                      key={s}
                      type="button"
                      aria-pressed={isActive}
                      aria-label={t(`tooth_chart.surfaces.${s}`)}
                      onClick={() => patchTooth({ surface: s })}
                      style={{
                        padding: s === 'whole' ? '6px 12px' : '6px 10px',
                        borderRadius: 8,
                        fontFamily: s === 'whole' ? undefined : 'var(--font-mono)',
                        fontSize: 13,
                        fontWeight: 600,
                        minWidth: s === 'whole' ? undefined : 34,
                        textAlign: 'center',
                        background: isActive ? 'var(--primary-soft)' : 'var(--surface-2)',
                        border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                        color: isActive ? 'var(--primary)' : 'var(--ink-2)',
                      }}
                    >
                      {label}
                    </UnstyledButton>
                  );
                })}
              </Group>
            </Box>

            {/* statusPalette */}
            <Box>
              <Text
                style={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--ink-3)',
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                {t('tooth_chart.set_state')}
              </Text>
              <Group gap={8} wrap="wrap" role="group" aria-label={t('tooth_chart.set_state')}>
                {TOOTH_STATE_OPTIONS.map((s) => {
                  const isActive = currentState === s;
                  return (
                    <UnstyledButton
                      key={s}
                      type="button"
                      aria-pressed={isActive}
                      aria-label={t(`tooth_chart.states.${s}`)}
                      onClick={() => patchTooth({ state: s })}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 7,
                        padding: '6px 10px',
                        borderRadius: 8,
                        fontSize: 12.5,
                        background: isActive ? 'var(--primary-soft)' : 'var(--surface-2)',
                        border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                        color: 'var(--ink)',
                      }}
                    >
                      <Box
                        style={{
                          position: 'relative',
                          width: 13,
                          height: 13,
                          borderRadius: 3,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: statusFill(s),
                          border:
                            STATUS[s].fill === 'empty'
                              ? '1.5px solid var(--border-strong)'
                              : '1px solid var(--border)',
                        }}
                      >
                        {STATUS[s].mark === 'x' && (
                          <Text
                            span
                            style={{
                              fontSize: 10,
                              lineHeight: 1,
                              color: 'var(--ink-3)',
                              fontWeight: 700,
                            }}
                          >
                            ✕
                          </Text>
                        )}
                        {STATUS[s].mark === 'extract' && (
                          <Text
                            span
                            style={{
                              fontSize: 10,
                              lineHeight: 1,
                              color: 'var(--text-on-danger)',
                              fontWeight: 700,
                            }}
                          >
                            ✕
                          </Text>
                        )}
                      </Box>
                      {t(`tooth_chart.states.${s}`)}
                    </UnstyledButton>
                  );
                })}
              </Group>
            </Box>

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
        <Paper
          withBorder
          p="md"
          style={{
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-sm)',
            background: 'var(--surface)',
          }}
        >
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
        <Paper
          withBorder
          p="md"
          style={{ borderRadius: 'var(--radius-card)', background: 'var(--surface-2)' }}
        >
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
