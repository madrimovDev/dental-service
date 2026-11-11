import type { Diagnosis, ToothState, ToothSurface } from '@dental/api-client';
import { Mono } from '@dental/ui';
import { Box, Button, Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addToothEntries,
  dxName,
  groupToothEntries,
  removeToothGroup,
  suggestedStateForDiagnosis,
} from '../../clinical.mappers';
import type { ToothEntry, ToothHistoryRow } from '../../clinical.types';
import { DiagnosisPicker } from './DiagnosisPicker';
import { STATUS, statusFill } from './ToothCell';
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

type Props = {
  tooth: number;
  entries: ToothEntry[];
  onEntriesChange: (next: ToothEntry[]) => void;
  /** Tashxis id → nom (chiplar uchun). */
  diagnosisById: Map<string, Diagnosis>;
  history: ToothHistoryRow[];
  lang: 'uz' | 'ru';
  chair: boolean;
  canEdit: boolean;
  canAddToPlan: boolean;
  saving: boolean;
  /** Joriy tahrirni snapshot sifatida saqlash. */
  onSaveOnly: (entries: ToothEntry[]) => void;
  /** Tashxisni rejaga qo'shish (saqlash + qoralama reja). */
  onAddToPlan: (entries: ToothEntry[], label: string, service?: SuggestedService) => void;
};

export function ToothPanel({
  tooth,
  entries,
  onEntriesChange,
  diagnosisById,
  history,
  lang,
  chair,
  canEdit,
  canAddToPlan,
  saving,
  onSaveOnly,
  onAddToPlan,
}: Props) {
  const { t } = useTranslation();
  const [surfaces, setSurfaces] = useState<ToothSurface[]>([]);
  const [state, setState] = useState<ToothState>('healthy');
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [service, setService] = useState<SuggestedService | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tish almashganda tanlov tozalanadi
  useEffect(() => {
    setSurfaces([]);
    setState('healthy');
    setDiagnosis(null);
    setService(null);
  }, [tooth]);

  const minH = chair ? 'var(--tap-chair)' : 'var(--tap-min)';
  const groups = groupToothEntries(entries, tooth);
  const canAdd = diagnosis !== null || state !== 'healthy';
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
    const next = addToothEntries(entries, {
      toothNumber: tooth,
      surfaces,
      state,
      diagnosisId: diagnosis?.id ?? null,
    });
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

  return (
    <Paper
      withBorder
      p="md"
      aria-label={t('odontogram.tooth_title', { n: tooth })}
      style={{
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-sm)',
        background: 'var(--surface)',
        borderColor: 'var(--primary)',
      }}
    >
      <Stack gap="md">
        <Group justify="space-between" align="baseline" wrap="nowrap">
          <Text style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>
            {t('odontogram.tooth_title', { n: tooth })}
          </Text>
          <Text style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {t(`tooth_chart.${quadrantKey(tooth)}`)}
          </Text>
        </Group>

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
                        border: active ? '1.5px solid var(--primary)' : '1px solid var(--border)',
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
                        border: active ? '1.5px solid var(--primary)' : '1px solid var(--border)',
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

        {canEdit && canAddToPlan && (
          <TreatmentSuggestions
            diagnosis={
              diagnosis ??
              (groups[0]?.diagnosisId ? (diagnosisById.get(groups[0].diagnosisId) ?? null) : null)
            }
            lang={lang}
            chair={chair}
            value={service}
            onChange={setService}
          />
        )}

        {canEdit && (
          <Stack gap={8}>
            <Button variant="light" disabled={!canAdd} onClick={applyPending} styles={btnStyles}>
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
                  disabled={!canAdd && groups.length === 0}
                  onClick={() => {
                    const next = canAdd ? applyPending() : entries;
                    const first = groupLabel(
                      groupToothEntries(next, tooth)[0] ?? { state, diagnosisId: null },
                    );
                    onAddToPlan(next, first, service ?? undefined);
                  }}
                  styles={btnStyles}
                >
                  {t('odontogram.add_to_plan')}
                </Button>
              )}
            </Group>
          </Stack>
        )}

        <Box>
          <Text style={sectionLabel}>{t('odontogram.tooth_history', { n: tooth })}</Text>
          {history.length === 0 ? (
            <Text style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {t('odontogram.history_empty')}
            </Text>
          ) : (
            <Stack gap={4}>
              {history.slice(0, 6).map((h) => (
                <Group key={`${h.chartId}:${h.state}:${h.diagnosisId}`} gap={10} wrap="nowrap">
                  <Mono>
                    <Text span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                      {new Date(h.createdAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ')}
                    </Text>
                  </Mono>
                  <Text style={{ fontSize: 13, color: 'var(--ink)' }}>
                    {groupLabel(h)} · {surfaceText(h.surfaces)}
                  </Text>
                </Group>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
