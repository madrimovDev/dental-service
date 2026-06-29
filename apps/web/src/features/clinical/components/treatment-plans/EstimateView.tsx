import { Mono, StateView, StatusPill } from '@dental/ui';
import { Divider, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format.ts';
import { useTreatmentPlanEstimate } from '../../clinical.api';
import { toEstimateVM } from '../../clinical.mappers';

/**
 * CLI-223/224: smeta — "bemorga taqdim qilish" yuzasi. Modal ichida (har doim mount EMAS):
 * paid/balans matnlari faqat ochilganda render bo'ladi (TreatmentPlansTab regression cheklovi).
 */
export function EstimateView({
  planId,
  opened,
  onClose,
}: {
  planId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // enabled=opened — modal yopiq bo'lsa so'rov yuborilmaydi (lazy).
  const estimateQuery = useTreatmentPlanEstimate(planId, opened);

  return (
    <Modal opened={opened} onClose={onClose} title={t('treatment_plan.estimate')} size="lg">
      {estimateQuery.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => estimateQuery.refetch()}
        />
      ) : estimateQuery.isLoading || !estimateQuery.data ? (
        <StateView status="loading" skeleton="table" />
      ) : (
        <EstimateBody data={toEstimateVM(estimateQuery.data)} />
      )}
    </Modal>
  );
}

function EstimateBody({ data }: { data: ReturnType<typeof toEstimateVM> }) {
  const { t } = useTranslation();
  return (
    <Stack gap="md">
      {data.stages.length === 0 ? (
        <Text c="dimmed">{t('treatment_plan.estimate_empty')}</Text>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('treatment_plan.service_name')}</Table.Th>
              <Table.Th>{t('treatment_plan.cost')}</Table.Th>
              <Table.Th>{t('treatment_plan.status')}</Table.Th>
              <Table.Th>{t('treatment_plan.acceptance')}</Table.Th>
              <Table.Th>{t('treatment_plan.estimate_paid')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.stages.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>{s.serviceName}</Table.Td>
                <Table.Td>{s.costText}</Table.Td>
                <Table.Td>
                  <StatusPill status={s.statusTone}>{t(s.statusLabelKey)}</StatusPill>
                </Table.Td>
                <Table.Td>
                  <StatusPill status={s.acceptanceTone}>{t(s.acceptanceLabelKey)}</StatusPill>
                </Table.Td>
                <Table.Td>{s.paidText}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
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
          <Text fw={700}>{t('treatment_plan.balance')}</Text>
          <Text fw={700} c={data.balance > 0 ? 'var(--danger)' : undefined}>
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
    <Group justify="space-between">
      <Text c="dimmed">{label}</Text>
      <Text>
        <Mono>
          {value} {t('common.currency')}
        </Mono>
      </Text>
    </Group>
  );
}
