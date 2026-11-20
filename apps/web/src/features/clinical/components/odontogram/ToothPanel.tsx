import type {
  Diagnosis,
  ToothState,
  ToothSurface,
  TreatmentPlan,
  TreatmentPlanStatus,
} from '@dental/api-client';
import { Mono } from '@dental/ui';
import {
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addToothEntries,
  dxName,
  groupToothEntries,
  removeToothGroup,
  resultingStateForPlan,
  suggestedStateForDiagnosis,
} from '../../clinical.mappers';
import type { ToothEntry, ToothHistoryRow } from '../../clinical.types';
import { DiagnosisPicker } from './DiagnosisPicker';
import { STATUS, statusFill } from './ToothCell';
import { ToothHistoryTab } from './ToothHistoryTab';
import { type SuggestedService, TreatmentSuggestions } from './TreatmentSuggestions';

const TOOTH_STATE_OPTIONS: ToothState[] = [
  'healthy',
  'caries',
  'filling',
  'crown',
  'root_canal',
  'implant',
  'missing',
  'to_extract',
  'temporary',
  'veneer',
];

/** Bosqich bajarilgach tish holati (StageRow bilan bir xil ro'yxat). */
const RESULT_STATES: ToothState[] = [
  'filling',
  'crown',
  'root_canal',
  'implant',
  'veneer',
  'missing',
  'healthy',
  'temporary',
];
const NO_RESULT = '__none__';

export type PlanTarget = 'current' | 'new';

/** «Rejaga qo'shish» tanlovi (FT-01.3). */
export type AddToPlanRequest = {
  /** Diagramma/stage nomi uchun zaxira (xizmat tanlanmagan bo'lsa). */
  label: string;
  service?: SuggestedService;
  resultingToothState: ToothState | null;
  target: PlanTarget;
  /** Ko'p tishda: `true` — barcha tishlar bitta bosqichda (ko'prik), aks holda har tishga alohida. */
  singleStage: boolean;
};

/** 5 yuza (FDI: M medial, O okklyuzion/chaynov, D distal, B bukkal/lunj, L lingual/til). */
const FACES: Array<Exclude<ToothSurface, 'whole' | 'I'>> = ['M', 'O', 'D', 'B', 'L'];

const sectionLabel = {
  fontSize: 11,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'var(--ink-3)',
  fontWeight: 600,
  marginBottom: 6,
};

function quadrantKey(n: number): 'upper_right' | 'upper_left' | 'lower_right' | 'lower_left' {
  const q = Math.floor(n / 10);
  if (q === 1 || q === 5) return 'upper_right';
  if (q === 2 || q === 6) return 'upper_left';
  if (q === 4 || q === 8) return 'lower_right';
  return 'lower_left';
}

type PanelTab = 'tooth' | 'history';

type Props = {
  patientId: string;
  /** Tanlangan tish(lar), o'sish tartibida (FT-01.3 ko'p tanlash). */
  teeth: readonly number[];
  entries: ToothEntry[];
  onEntriesChange: (next: ToothEntry[]) => void;
  /** Tashxis id → nom (chiplar uchun). */
  diagnosisById: Map<string, Diagnosis>;
  history: ToothHistoryRow[];
  /** FT-01.4: «Tish tarixi» tabi uchun bemor rejalari (bosqichlar nested). */
  plans: ComponentProps<typeof ToothHistoryTab>['plans'];
  lang: 'uz' | 'ru';
  chair: boolean;
  canEdit: boolean;
  canAddToPlan: boolean;
  /** FT-01.3: bemorning eng so'nggi ochiq rejasi («Joriy reja»); yo'q → faqat «Yangi reja». */
  currentPlan: (Pick<TreatmentPlan, 'id' | 'title'> & { status: TreatmentPlanStatus }) | null;
  saving: boolean;
  /** Joriy tahrirni snapshot sifatida saqlash. */
  onSaveOnly: (entries: ToothEntry[]) => void;
  /**
   * Rejaga qo'shish. `entries` — yangi tashxis qo'shilgan bo'lsa yangilangan draft (avval
   * snapshot saqlanadi), aks holda `null` (o'zgarmagan holat qayta snapshot qilinmaydi).
   */
  onAddToPlan: (entries: ToothEntry[] | null, req: AddToPlanRequest) => void;
};

export function ToothPanel({
  patientId,
  teeth,
  entries,
  onEntriesChange,
  diagnosisById,
  history,
  plans,
  lang,
  chair,
  canEdit,
  canAddToPlan,
  currentPlan,
  saving,
  onSaveOnly,
  onAddToPlan,
}: Props) {
  const { t } = useTranslation();
  const [surfaces, setSurfaces] = useState<ToothSurface[]>([]);
  const [state, setState] = useState<ToothState>('healthy');
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [service, setService] = useState<SuggestedService | null>(null);
  // undefined = tashxisdan avtomatik (caries → filling ...), null = «Belgilanmagan».
  const [resultOverride, setResultOverride] = useState<ToothState | null | undefined>(undefined);
  const [targetPick, setTargetPick] = useState<PlanTarget>('current');
  const [singleStage, setSingleStage] = useState(false);
  // FT-01.4: «Tish» (tahrir/ko'rish) yoki «Tish tarixi» — tish almashtirilganda saqlanadi.
  const [tab, setTab] = useState<PanelTab>('tooth');

  // Bitta tish: chiplar, kvadrant, tarix shu tish bo'yicha; ko'p tishda — faqat umumiy tanlov.
  const tooth = teeth.length === 1 ? (teeth[0] ?? null) : null;
  const teethKey = teeth.join(',');
  const prevTeeth = useRef<readonly number[]>(teeth);

  // Boshqa tish(lar)ga o'tilganda tanlov tozalanadi; Shift/uzun bosish bilan tanlovni
  // kengaytirish/qisqartirishda (kesishma bor) tanlangan xizmat va holat saqlanadi.
  // biome-ignore lint/correctness/useExhaustiveDependencies: faqat tanlov o'zgarganda
  useEffect(() => {
    const overlap = teeth.some((n) => prevTeeth.current.includes(n));
    prevTeeth.current = teeth;
    if (overlap) return;
    setSurfaces([]);
    setState('healthy');
    setDiagnosis(null);
    setService(null);
    setResultOverride(undefined);
    setSingleStage(false);
  }, [teethKey]);

  const minH = chair ? 'var(--tap-chair)' : 'var(--tap-min)';
  const groups = tooth === null ? [] : groupToothEntries(entries, tooth);
  const canAdd = diagnosis !== null || state !== 'healthy';
  const target: PlanTarget = currentPlan ? targetPick : 'new';
  const resultingState =
    resultOverride !== undefined
      ? resultOverride
      : (resultingStateForPlan(canAdd ? state : groups[0]?.state) ?? null);
  // Rejaga: tashxis/holat yoki xizmat bo'lsa kifoya (tish → xizmat → reja).
  const canPlan = canAdd || groups.length > 0 || service !== null;
  // Uzun matnli tugma (ru) ikki qatorga o'raladi, qirqilmaydi.
  const btnStyles = {
    root: { height: 'auto', minHeight: minH, padding: '8px 12px' },
    label: { whiteSpace: 'normal' as const, textAlign: 'center' as const },
  };

  const toggleSurface = (s: ToothSurface) =>
    setSurfaces((cur) => {
      if (s === 'whole') return cur.includes('whole') ? [] : ['whole'];
      const without = cur.filter((x) => x !== 'whole');
      return without.includes(s) ? without.filter((x) => x !== s) : [...without, s];
    });

  const pickDiagnosis = (d: Diagnosis | null) => {
    setDiagnosis(d);
    const suggested = d ? suggestedStateForDiagnosis(d) : null;
    if (suggested && state === 'healthy') setState(suggested);
  };

  /** Tanlovni draftga qo'shadi va yangi draftni qaytaradi (tanlov tozalanadi). */
  const applyPending = (): ToothEntry[] => {
    if (!canAdd) return entries;
    const next = teeth.reduce(
      (acc, n) =>
        addToothEntries(acc, {
          toothNumber: n,
          surfaces,
          state,
          diagnosisId: diagnosis?.id ?? null,
        }),
      entries,
    );
    onEntriesChange(next);
    setSurfaces([]);
    setDiagnosis(null);
    return next;
  };

  const groupLabel = (g: { state: ToothState; diagnosisId: string | null }) => {
    const d = g.diagnosisId ? diagnosisById.get(g.diagnosisId) : undefined;
    return d ? dxName(d, lang) : t(`tooth_chart.states.${g.state}`);
  };

  const surfaceText = (list: ToothSurface[]) =>
    list.includes('whole') ? t('tooth_chart.surfaces.whole') : list.join('+');

  const title =
    tooth !== null
      ? t('odontogram.tooth_title', { n: tooth })
      : t('odontogram.selected_teeth', { list: teeth.join(', ') });

  return (
    <Paper
      withBorder
      p="md"
      aria-label={title}
      style={{
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-sm)',
        background: 'var(--surface)',
        borderColor: 'var(--primary)',
      }}
    >
      <Stack gap="md">
        <Group justify="space-between" align="baseline" wrap="nowrap">
          <Text style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{title}</Text>
          {tooth !== null && (
            <Text style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {t(`tooth_chart.${quadrantKey(tooth)}`)}
            </Text>
          )}
        </Group>
        {canEdit && tooth !== null && (
          <Text style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: -8 }}>
            {t('odontogram.multi_hint')}
          </Text>
        )}

        {tooth !== null && (
          <SegmentedControl
            fullWidth
            value={tab}
            onChange={(v) => setTab(v as PanelTab)}
            aria-label={t('odontogram.panel_tabs')}
            data={[
              { value: 'tooth', label: t('odontogram.tab_tooth') },
              { value: 'history', label: t('odontogram.tab_history') },
            ]}
            styles={{
              control: { minHeight: minH },
              label: {
                minHeight: minH,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
            }}
          />
        )}

        {tooth !== null && tab === 'history' ? (
          <ToothHistoryTab
            patientId={patientId}
            tooth={tooth}
            snapshots={history}
            plans={plans}
            diagnosisById={diagnosisById}
            lang={lang}
            chair={chair}
          />
        ) : (
          <>
            {canEdit && (
              <>
                <Box>
                  <Text style={sectionLabel}>{t('odontogram.surfaces')}</Text>
                  <Group gap={8} wrap="wrap" role="group" aria-label={t('odontogram.surfaces')}>
                    {[...FACES, 'whole' as const].map((s) => {
                      const active = surfaces.includes(s);
                      return (
                        <UnstyledButton
                          key={s}
                          type="button"
                          aria-pressed={active}
                          aria-label={t(`tooth_chart.surfaces.${s}`)}
                          onClick={() => toggleSurface(s)}
                          style={{
                            minHeight: minH,
                            minWidth: minH,
                            padding: '0 12px',
                            borderRadius: 8,
                            fontSize: 14,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: active ? 'var(--primary-soft)' : 'var(--surface-2)',
                            border: active
                              ? '1.5px solid var(--primary)'
                              : '1px solid var(--border)',
                            color: active ? 'var(--primary)' : 'var(--ink)',
                          }}
                        >
                          {s === 'whole' ? (
                            t('tooth_chart.surfaces.whole')
                          ) : (
                            <>
                              <Mono>
                                <Text span style={{ fontWeight: 700 }}>
                                  {s}
                                </Text>
                              </Mono>
                              <Text span style={{ fontWeight: 500 }}>
                                {t(`odontogram.face.${s}`)}
                              </Text>
                            </>
                          )}
                        </UnstyledButton>
                      );
                    })}
                  </Group>
                </Box>

                <Box>
                  <Text style={sectionLabel}>{t('odontogram.state')}</Text>
                  <Group gap={8} wrap="wrap" role="group" aria-label={t('odontogram.state')}>
                    {TOOTH_STATE_OPTIONS.map((s) => {
                      const active = state === s;
                      return (
                        <UnstyledButton
                          key={s}
                          type="button"
                          aria-pressed={active}
                          aria-label={t(`tooth_chart.states.${s}`)}
                          onClick={() => setState(s)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 7,
                            minHeight: minH,
                            padding: '0 10px',
                            borderRadius: 8,
                            fontSize: 13,
                            background: active ? 'var(--primary-soft)' : 'var(--surface-2)',
                            border: active
                              ? '1.5px solid var(--primary)'
                              : '1px solid var(--border)',
                            color: 'var(--ink)',
                          }}
                        >
                          <Box
                            style={{
                              width: 13,
                              height: 13,
                              borderRadius: 3,
                              flexShrink: 0,
                              background: statusFill(s),
                              border:
                                STATUS[s].fill === 'empty'
                                  ? '1.5px solid var(--border-strong)'
                                  : '1px solid var(--border)',
                            }}
                          />
                          {t(`tooth_chart.states.${s}`)}
                        </UnstyledButton>
                      );
                    })}
                  </Group>
                </Box>

                <DiagnosisPicker
                  selected={diagnosis}
                  onSelect={pickDiagnosis}
                  lang={lang}
                  chair={chair}
                />
              </>
            )}

            {tooth !== null && (
              <Box>
                <Text style={sectionLabel}>{t('odontogram.tooth_diagnoses')}</Text>
                {groups.length === 0 ? (
                  <Text style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                    {t('odontogram.tooth_diagnoses_empty')}
                  </Text>
                ) : (
                  <Group gap={8} wrap="wrap">
                    {groups.map((g) => (
                      <Group
                        key={g.key}
                        gap={6}
                        wrap="nowrap"
                        data-testid="tooth-dx-chip"
                        style={{
                          padding: '4px 6px 4px 12px',
                          borderRadius: 99,
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--ink)',
                        }}
                      >
                        <Text span style={{ fontSize: 13, fontWeight: 600 }}>
                          {groupLabel(g)} · {surfaceText(g.surfaces)}
                        </Text>
                        {canEdit && (
                          <UnstyledButton
                            type="button"
                            aria-label={t('odontogram.remove_diagnosis', { name: groupLabel(g) })}
                            onClick={() => onEntriesChange(removeToothGroup(entries, tooth, g.key))}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 99,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'var(--surface)',
                              color: 'var(--ink-2)',
                            }}
                          >
                            <IconX size={14} />
                          </UnstyledButton>
                        )}
                      </Group>
                    ))}
                  </Group>
                )}
              </Box>
            )}

            {canEdit && canAddToPlan && (
              <Stack gap={8}>
                <TreatmentSuggestions
                  diagnosis={
                    diagnosis ??
                    (groups[0]?.diagnosisId
                      ? (diagnosisById.get(groups[0].diagnosisId) ?? null)
                      : null)
                  }
                  lang={lang}
                  chair={chair}
                  value={service}
                  onChange={setService}
                />
                <Select
                  label={t('treatment_plan.resulting_state')}
                  aria-label={t('treatment_plan.resulting_state')}
                  value={resultingState ?? NO_RESULT}
                  onChange={(v) =>
                    setResultOverride(!v || v === NO_RESULT ? null : (v as ToothState))
                  }
                  data={[
                    { value: NO_RESULT, label: t('treatment_plan.resulting_state_none') },
                    ...RESULT_STATES.map((s) => ({
                      value: s,
                      label: t(`tooth_chart.states.${s}`),
                    })),
                  ]}
                  allowDeselect={false}
                  comboboxProps={{ withinPortal: true }}
                  styles={{ input: { minHeight: minH } }}
                />
                {teeth.length > 1 && (
                  <Checkbox
                    label={t('odontogram.single_stage')}
                    checked={singleStage}
                    onChange={(e) => setSingleStage(e.currentTarget.checked)}
                    styles={{ body: { alignItems: 'center', minHeight: minH } }}
                  />
                )}
                {currentPlan && (
                  <Box>
                    <Text style={sectionLabel}>{t('odontogram.target_label')}</Text>
                    <SegmentedControl
                      fullWidth
                      value={target}
                      onChange={(v) => setTargetPick(v as PlanTarget)}
                      aria-label={t('odontogram.target_label')}
                      data={[
                        { value: 'current', label: t('odontogram.target_current') },
                        { value: 'new', label: t('odontogram.target_new') },
                      ]}
                      styles={{
                        control: { minHeight: minH },
                        label: {
                          minHeight: minH,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        },
                      }}
                    />
                    {target === 'current' && (
                      <Text style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 6 }}>
                        {currentPlan.title} · {t(`treatment_plan.status_${currentPlan.status}`)}
                      </Text>
                    )}
                  </Box>
                )}
              </Stack>
            )}

            {canEdit && (
              <Stack gap={8}>
                <Button
                  variant="light"
                  disabled={!canAdd}
                  onClick={applyPending}
                  styles={btnStyles}
                >
                  {t('odontogram.add_diagnosis')}
                </Button>
                <Group gap={8} grow wrap="nowrap">
                  <Button
                    variant="default"
                    loading={saving}
                    disabled={!canAdd && groups.length === 0}
                    onClick={() => onSaveOnly(canAdd ? applyPending() : entries)}
                    styles={btnStyles}
                  >
                    {t('odontogram.save_only')}
                  </Button>
                  {canAddToPlan && (
                    <Button
                      loading={saving}
                      disabled={!canPlan}
                      onClick={() => {
                        // Nom (xizmatsiz bosqich uchun): yangi tashxis/holat, aks holda tishdagi birinchisi.
                        const label = groupLabel(
                          canAdd
                            ? { state, diagnosisId: diagnosis?.id ?? null }
                            : (groups[0] ?? { state, diagnosisId: null }),
                        );
                        const next = canAdd ? applyPending() : null;
                        onAddToPlan(next, {
                          label,
                          service: service ?? undefined,
                          resultingToothState: resultingState,
                          target,
                          singleStage: teeth.length > 1 && singleStage,
                        });
                      }}
                      styles={btnStyles}
                    >
                      {t('odontogram.add_to_plan')}
                    </Button>
                  )}
                </Group>
              </Stack>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
