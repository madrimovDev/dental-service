import type { CreateToothStateInput, Diagnosis } from '@dental/api-client';
import { StateView } from '@dental/ui';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowBack, IconHistory } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useCreatePlan,
  useCreateToothChart,
  useDiagnoses,
  useLatestToothChart,
  useToothChartHistory,
  useTreatmentPlans,
} from '../../clinical.api';
import {
  entriesToCreateInput,
  plannedTeethFromPlans,
  toothHistoryRows,
  toToothDisplayMap,
  toToothEntries,
} from '../../clinical.mappers';
import type { ToothEntry } from '../../clinical.types';
import { Odontogram } from './Odontogram';
import { ToothPanel } from './ToothPanel';

type Props = { patientId: string };
type View = 'current' | 'plan' | 'history';

const CHAIR_KEY = 'dental.odontogram.chairMode';

const readChairMode = (): boolean => {
  try {
    return window.localStorage.getItem(CHAIR_KEY) === '1';
  } catch {
    return false;
  }
};

const writeChairMode = (on: boolean) => {
  try {
    window.localStorage.setItem(CHAIR_KEY, on ? '1' : '0');
  } catch {
    /* saqlash imkonsiz (private mode / quota) — rejim faqat joriy sessiyada */
  }
};

export function OdontogramTab({ patientId }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ru' ? 'ru' : 'uz';
  const { hasPermission, user } = useAuthStore();
  const canEdit = hasPermission('medical_record.edit');

  const chartQuery = useLatestToothChart(patientId);
  const historyQuery = useToothChartHistory(patientId);
  const catalogQuery = useDiagnoses();
  const plansQuery = useTreatmentPlans(patientId);
  const createMut = useCreateToothChart(patientId);
  const createPlanMut = useCreatePlan(patientId);

  const [view, setView] = useState<View>('current');
  const [chairMode, setChairMode] = useState<boolean>(readChairMode);
  const [isPrimary, setIsPrimary] = useState(false);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [draft, setDraft] = useState<ToothEntry[]>([]);
  const [draftNotes, setDraftNotes] = useState('');
  // CLI-191: tarix — tanlangan eski snapshot id (null = hozirgi/tahrirlash rejimi).
  const [viewingId, setViewingId] = useState<string | null>(null);

  useEffect(() => {
    if (!chartQuery.data) return;
    setDraft(toToothEntries(chartQuery.data));
    setIsPrimary(chartQuery.data.isPrimaryDentition);
  }, [chartQuery.data]);

  const diagnosisById = useMemo(
    () => new Map<string, Diagnosis>((catalogQuery.data ?? []).map((d) => [d.id, d])),
    [catalogQuery.data],
  );

  // CLI-191: ko'rilayotgan eski snapshot (mavjud bo'lsa) — read-only.
  const viewingSnapshot = useMemo(
    () => historyQuery.data?.find((ch) => ch.id === viewingId) ?? null,
    [historyQuery.data, viewingId],
  );
  const isReadOnly = viewingSnapshot !== null;

  const displays = useMemo(
    () => toToothDisplayMap(viewingSnapshot ? toToothEntries(viewingSnapshot) : draft),
    [viewingSnapshot, draft],
  );

  const plannedTeeth = useMemo(() => plannedTeethFromPlans(plansQuery.data), [plansQuery.data]);

  const toothHistory = useMemo(
    () => (selectedTooth === null ? [] : toothHistoryRows(historyQuery.data, selectedTooth)),
    [historyQuery.data, selectedTooth],
  );

  const historyOptions =
    historyQuery.data?.map((ch) => ({
      value: ch.id,
      label: new Date(ch.createdAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-UZ'),
    })) ?? [];

  const save = (entries: ToothEntry[], onSaved?: () => void) => {
    const states: CreateToothStateInput[] = entriesToCreateInput(entries);
    createMut.mutate(
      { patientId, isPrimaryDentition: isPrimary, notes: draftNotes || undefined, states },
      {
        onSuccess: () => {
          setDraftNotes('');
          onSaved?.();
        },
      },
    );
  };

  const addToPlan = (entries: ToothEntry[], label: string) => {
    const tooth = selectedTooth;
    if (tooth === null || !user?.id) return;
    save(entries, () =>
      createPlanMut.mutate(
        {
          patientId,
          doctorId: user.id,
          title: t('odontogram.plan_title', { n: tooth }),
          stages: [{ serviceName: label, toothNumbers: [tooth], estimatedVisits: 1, cost: 0 }],
        },
        {
          onSuccess: () =>
            notifications.show({ color: 'teal', message: t('odontogram.added_to_plan') }),
        },
      ),
    );
  };

  const changeView = (next: string) => {
    const v = next as View;
    setView(v);
    if (v !== 'history') setViewingId(null);
  };

  const editing = canEdit && view === 'current' && !isReadOnly;

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap">
        <Title order={4}>{t('tooth_chart.title')}</Title>
        <Group gap="sm" wrap="wrap">
          <SegmentedControl
            value={view}
            onChange={changeView}
            aria-label={t('odontogram.views_label')}
            data={[
              { value: 'current', label: t('odontogram.view_current') },
              { value: 'plan', label: t('odontogram.view_plan') },
              { value: 'history', label: t('odontogram.view_history') },
            ]}
          />
          <Switch
            label={t('odontogram.chair_mode')}
            checked={chairMode}
            onChange={(e) => {
              setChairMode(e.currentTarget.checked);
              writeChairMode(e.currentTarget.checked);
            }}
          />
          <Switch
            label={t('tooth_chart.primary_dentition')}
            checked={isReadOnly ? viewingSnapshot.isPrimaryDentition : isPrimary}
            onChange={(e) => {
              setIsPrimary(e.currentTarget.checked);
              setDraft([]);
              setSelectedTooth(null);
            }}
            disabled={!editing}
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

      {view === 'history' && (
        <Select
          leftSection={<IconHistory size={16} />}
          placeholder={t('tooth_chart.view_history')}
          data={historyOptions}
          value={viewingId}
          onChange={setViewingId}
          clearable
          maw={320}
          nothingFoundMessage={t('tooth_chart.no_history')}
          comboboxProps={{ withinPortal: true }}
        />
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
          // Kreslo yoni rejimida katta kataklar uchun yagona ustun: chart to'liq kenglikda, panel pastda.
          gridTemplateColumns: chairMode ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(280px, 360px)',
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
            overflowX: 'auto',
          }}
        >
          <Odontogram
            displays={displays}
            plannedTeeth={view === 'history' ? undefined : plannedTeeth}
            chairMode={chairMode}
            isPrimaryDentition={isReadOnly ? viewingSnapshot.isPrimaryDentition : isPrimary}
            selectedTooth={isReadOnly ? null : selectedTooth}
            onSelectTooth={(n) => {
              if (!isReadOnly) setSelectedTooth(n);
            }}
          />
        </Paper>

        {selectedTooth !== null && !isReadOnly && (
          <ToothPanel
            tooth={selectedTooth}
            entries={draft}
            onEntriesChange={setDraft}
            diagnosisById={diagnosisById}
            history={toothHistory}
            lang={lang}
            chair={chairMode}
            canEdit={editing}
            canAddToPlan={Boolean(user?.id)}
            saving={createMut.isPending || createPlanMut.isPending}
            onSaveOnly={(entries) => save(entries)}
            onAddToPlan={addToPlan}
          />
        )}
      </Box>

      {view === 'plan' && (
        <Paper
          withBorder
          p="md"
          style={{ borderRadius: 'var(--radius-card)', background: 'var(--surface)' }}
        >
          <Text fw={600} mb={6}>
            {t('odontogram.plan_teeth')}
          </Text>
          {plannedTeeth.size === 0 ? (
            <Text size="sm" c="dimmed">
              {t('odontogram.plan_empty')}
            </Text>
          ) : (
            <Group gap={8} wrap="wrap">
              {[...plannedTeeth]
                .sort((a, b) => a - b)
                .map((n) => (
                  <Badge key={n} variant="light" color="yellow" size="lg">
                    {n}
                  </Badge>
                ))}
            </Group>
          )}
        </Paper>
      )}

      {editing && (
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
              <Button
                onClick={() => save(draft)}
                loading={createMut.isPending}
                disabled={draft.length === 0}
                style={{ minHeight: chairMode ? 'var(--tap-chair)' : undefined }}
              >
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
