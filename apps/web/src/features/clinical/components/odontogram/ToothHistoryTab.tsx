import type { Diagnosis, ToothSurface, TreatmentPlan, TreatmentStage } from '@dental/api-client';
import { Mono, StateView, StatusPill } from '@dental/ui';
import { Box, Button, Group, Image, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconFile, IconUpload } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthedObjectUrl } from '@/hooks/useAuthedObjectUrl';
import { formatCurrency } from '@/lib/format.ts';
import { useAuthStore } from '@/stores/auth-store.ts';
import { usePatientToothImages, useVisitNotes } from '../../clinical.api';
import {
  dxName,
  stageStatusToTone,
  toothStageRows,
  toothVisitNotes,
  toPatientImageVM,
} from '../../clinical.mappers';
import type { PatientImageVM, ToothHistoryRow } from '../../clinical.types';
import { ImagePreviewModal } from '../images/ImagePreviewModal';
import { ImageUploadModal } from '../images/ImageUploadModal';

const sectionLabel = {
  fontSize: 11,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  color: 'var(--ink-3)',
  fontWeight: 600,
  marginBottom: 6,
};

type Props = {
  patientId: string;
  tooth: number;
  /** Odontogramma snapshot'lari bo'yicha shu tish qatorlari (yangisi birinchi). */
  snapshots: ToothHistoryRow[];
  plans:
    | Array<
        Pick<TreatmentPlan, 'id' | 'title' | 'status' | 'createdAt'> & {
          stages?: Array<
            Pick<
              TreatmentStage,
              'id' | 'serviceName' | 'toothNumbers' | 'status' | 'completedAt' | 'cost'
            >
          >;
        }
      >
    | undefined;
  diagnosisById: Map<string, Diagnosis>;
  lang: 'uz' | 'ru';
  chair: boolean;
};

function Thumb({ vm, onOpen }: { vm: PatientImageVM; onOpen: () => void }) {
  const { src } = useAuthedObjectUrl(vm.isImage ? vm.url : null);
  return (
    <UnstyledButton
      type="button"
      onClick={onOpen}
      aria-label={vm.displayTitle}
      style={{
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: 'var(--surface-2)',
        minHeight: 'var(--tap-min)',
      }}
    >
      <Box style={{ aspectRatio: '1 / 1', display: 'flex', alignItems: 'center' }}>
        {vm.isImage ? (
          <Image src={src ?? undefined} alt={vm.displayTitle} h="100%" w="100%" fit="cover" />
        ) : (
          <Box style={{ margin: '0 auto', color: 'var(--ink-3)' }}>
            <IconFile size={28} />
          </Box>
        )}
      </Box>
      <Text
        style={{ fontSize: 12, color: 'var(--ink-2)', padding: '4px 6px' }}
        lineClamp={1}
        title={vm.displayTitle}
      >
        {vm.displayTitle}
      </Text>
    </UnstyledButton>
  );
}

/**
 * FT-01.4 (CF-10): ToothPanel «Tarix» tabi — shu tish bo'yicha holat snapshot'lari, davolash
 * bosqichlari (reja nomi, holat, sana, narx), vizit yozuvlari (o'z `toothNumbers` yoki bosqich
 * orqali) va rasmlar (`GET /patients/{id}/images?tooth=NN`). Rasm yuklash tish bilan to'ldirilgan.
 * Rasm/vizit so'rovlari faqat tegishli permission bo'lsa yuboriladi (403 shovqinsiz).
 */
export function ToothHistoryTab({
  patientId,
  tooth,
  snapshots,
  plans,
  diagnosisById,
  lang,
  chair,
}: Props) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canViewImages = hasPermission('patient_image.view');
  const canUpload = hasPermission('patient_image.upload');
  const canViewNotes = hasPermission('medical_record.view');

  const imagesQuery = usePatientToothImages(patientId, tooth, canViewImages);
  const notesQuery = useVisitNotes(patientId, canViewNotes);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const stages = useMemo(() => toothStageRows(plans, tooth), [plans, tooth]);
  const notes = useMemo(
    () => toothVisitNotes(notesQuery.data, tooth, stages),
    [notesQuery.data, tooth, stages],
  );
  const images = useMemo(() => (imagesQuery.data ?? []).map(toPatientImageVM), [imagesQuery.data]);
  const preview = images.find((i) => i.id === previewId) ?? null;

  const locale = lang === 'ru' ? 'ru-RU' : 'uz-UZ';
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale);
  const surfaceText = (list: ToothSurface[]) =>
    list.includes('whole') ? t('tooth_chart.surfaces.whole') : list.join('+');
  const snapshotLabel = (h: ToothHistoryRow) => {
    const d = h.diagnosisId ? diagnosisById.get(h.diagnosisId) : undefined;
    return d ? dxName(d, lang) : t(`tooth_chart.states.${h.state}`);
  };
  const minH = chair ? 'var(--tap-chair)' : 'var(--tap-min)';
  const none = (
    <Text style={{ fontSize: 13, color: 'var(--ink-3)' }}>{t('odontogram.history_none')}</Text>
  );

  const dateCell = (iso: string) => (
    <Mono>
      <Text span style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
        {date(iso)}
      </Text>
    </Mono>
  );

  return (
    <Stack gap="md" aria-label={t('odontogram.tooth_history', { n: tooth })}>
      <Box>
        <Text style={sectionLabel}>{t('odontogram.history_states')}</Text>
        {snapshots.length === 0 ? (
          none
        ) : (
          <Stack gap={4}>
            {snapshots.slice(0, 10).map((h) => (
              <Group key={`${h.chartId}:${h.state}:${h.diagnosisId}`} gap={10} wrap="nowrap">
                {dateCell(h.createdAt)}
                <Text style={{ fontSize: 13, color: 'var(--ink)' }}>
                  {snapshotLabel(h)} · {surfaceText(h.surfaces)}
                </Text>
              </Group>
            ))}
          </Stack>
        )}
      </Box>

      <Box>
        <Text style={sectionLabel}>{t('odontogram.history_stages')}</Text>
        {stages.length === 0 ? (
          none
        ) : (
          <Stack gap={8}>
            {stages.map((s) => (
              <Box
                key={s.stageId}
                data-testid="tooth-history-stage"
                style={{
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--surface-2)',
                }}
              >
                <Group justify="space-between" wrap="nowrap" gap={8}>
                  <Text style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                    {s.serviceName}
                  </Text>
                  <StatusPill status={stageStatusToTone(s.status)}>
                    {t(`treatment_plan.stage_status_${s.status}`)}
                  </StatusPill>
                </Group>
                <Group gap={8} wrap="wrap" mt={4}>
                  {dateCell(s.date)}
                  <Text style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                    {s.planTitle} · {t(`treatment_plan.status_${s.planStatus}`)}
                  </Text>
                  <Text style={{ fontSize: 12, color: 'var(--ink-2)', marginLeft: 'auto' }}>
                    {formatCurrency(Number(s.cost), t)}
                  </Text>
                </Group>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {canViewNotes && (
        <Box>
          <Text style={sectionLabel}>{t('odontogram.history_visits')}</Text>
          {notes.length === 0 ? (
            none
          ) : (
            <Stack gap={6}>
              {notes.map((n) => {
                const text =
                  n.subjective ||
                  n.objective ||
                  n.plan ||
                  n.freeNotes ||
                  t('odontogram.visit_no_text');
                return (
                  <Group key={n.id} gap={10} wrap="nowrap" align="flex-start">
                    {dateCell(n.visitDate)}
                    <Text style={{ fontSize: 13, color: 'var(--ink)' }} lineClamp={2}>
                      {text}
                      {!n.signedAt && (
                        <Text span style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                          {' '}
                          · {t('odontogram.visit_draft')}
                        </Text>
                      )}
                    </Text>
                  </Group>
                );
              })}
            </Stack>
          )}
        </Box>
      )}

      {canViewImages && (
        <Box>
          <Group justify="space-between" align="center" mb={6}>
            <Text style={{ ...sectionLabel, marginBottom: 0 }}>
              {t('odontogram.history_images')}
            </Text>
            {canUpload && (
              <Button
                variant="light"
                size="xs"
                leftSection={<IconUpload size={14} />}
                onClick={() => setUploadOpen(true)}
                styles={{ root: { minHeight: minH } }}
              >
                {t('odontogram.upload_image')}
              </Button>
            )}
          </Group>
          {imagesQuery.isError ? (
            <StateView
              status="error"
              title={t('states.error_title')}
              retryLabel={t('states.retry')}
              onRetry={() => imagesQuery.refetch()}
            />
          ) : images.length === 0 ? (
            none
          ) : (
            <SimpleGrid cols={3} spacing={8}>
              {images.map((vm) => (
                <Thumb key={vm.id} vm={vm} onOpen={() => setPreviewId(vm.id)} />
              ))}
            </SimpleGrid>
          )}
          <ImagePreviewModal image={preview} onClose={() => setPreviewId(null)} />
          {canUpload && (
            <ImageUploadModal
              key={tooth}
              opened={uploadOpen}
              onClose={() => setUploadOpen(false)}
              patientId={patientId}
              defaultToothNumbers={[tooth]}
            />
          )}
        </Box>
      )}
    </Stack>
  );
}
