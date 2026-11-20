import { Mono, StateView, StatusPill } from '@dental/ui';
import { Divider, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format.ts';
import { useTreatmentPlanEstimate } from '../../clinical.api';
import { toEstimateVM } from '../../clinical.mappers';

/**
 * CLI-223/224: smeta — "bemorga taqdim qilish" yuzasi.
 * FT-01.5 (spec §3): modal EMAS — plan kartasining o'ng panelida yig'iladigan bo'lim.
 * Faqat ochilganda mount bo'ladi va so'rov yuboradi (lazy): paid/balans matnlari
 * yopiq holatda render bo'lmaydi (TreatmentPlansTab regression cheklovi).
 */
export function EstimatePanel({ planId }: { planId: string }) {
  const { t } = useTranslation();
  const estimateQuery = useTreatmentPlanEstimate(planId, true);

  if (estimateQuery.isError) {
    return (
      <StateView
        status="error"
        title={t('states.error_title')}
        retryLabel={t('states.retry')}
        onRetry={() => estimateQuery.refetch()}
      />
    );
  }
  if (estimateQuery.isLoading || !estimateQuery.data) {
    return <StateView status="loading" skeleton="table" />;
  }
  return <EstimateBody data={toEstimateVM(estimateQuery.data)} />;
}

function EstimateBody({ data }: { data: ReturnType<typeof toEstimateVM> }) {
  const { t } = useTranslation();
  return (
    <Stack gap="sm">
      {data.stages.length === 0 ? (
        <Text c="dimmed" size="sm">
          {t('treatment_plan.estimate_empty')}
        </Text>
      ) : (
        <Stack gap={8}>
          {data.stages.map((s) => (
            <Stack key={s.id} gap={2}>
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="sm" fw={500} truncate>
                  {s.serviceName}
                </Text>
                <Text size="sm">
                  <Mono>{s.costText}</Mono>
                </Text>
              </Group>
              {/* FT-04.3: bosqich chegirmasi smetada — list narx (chizilgan) va foiz. */}
              {s.listPriceText && s.discountPercent != null && (
                <Text size="xs" c="dimmed" ta="right" data-testid="estimate-stage-discount">
                  <del>{s.listPriceText}</del>{' '}
                  {t('treatment_plan.stage_discount', { pct: s.discountPercent })}
                </Text>
              )}
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <StatusPill status={s.acceptanceTone}>{t(s.acceptanceLabelKey)}</StatusPill>
                <Text size="xs" c="dimmed">
                  {t('treatment_plan.estimate_paid')}: <Mono>{s.paidText}</Mono>
                </Text>
              </Group>
            </Stack>
          ))}
        </Stack>
      )}

      <Divider />

      {/* Subtotallar har xil filtrli — yig'indi EMAS; balans yakuniy manba (CLI-223). */}
      <Stack gap={4}>
        <TotalRow label={t('treatment_plan.total_proposed')} value={data.totalProposedText} />
        <TotalRow label={t('treatment_plan.total_accepted')} value={data.totalAcceptedText} />
        <TotalRow label={t('treatment_plan.total_cost')} value={data.totalCostText} />
        <TotalRow label={t('treatment_plan.total_paid')} value={data.totalPaidText} />
        <Divider my={4} />
        <Group justify="space-between">
          <Text fw={700} size="sm">
            {t('treatment_plan.balance')}
          </Text>
          <Text fw={700} size="sm" c={data.balance > 0 ? 'var(--danger)' : undefined}>
            <Mono>{formatCurrency(data.balance, t)}</Mono>
          </Text>
        </Group>
      </Stack>
    </Stack>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation();
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs">
      <Text c="dimmed" size="sm">
        {label}
      </Text>
      <Text size="sm">
        <Mono>
          {value} {t('common.currency')}
        </Mono>
      </Text>
    </Group>
  );
}
