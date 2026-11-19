import { Mono, StateView } from '@dental/ui';
import { Badge, Group, Pagination, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BalanceBadge } from '@/components/BalanceBadge';
import { formatNumber } from '@/lib/format';
import {
  PATIENT_PAYMENTS_PAGE_SIZE,
  usePatientBalance,
  usePatientPayments,
  usePatientPlanTitles,
} from '../../patients.api';

/** FX-30: reja qarzi / rejasiz qoldiq / umumiy balans — alohida kartalar (pul mantig'i serverda). */
function FinanceCard({
  label,
  balance,
  testId,
}: {
  label: string;
  balance: number;
  testId: string;
}) {
  return (
    <Paper
      withBorder
      p="sm"
      radius="var(--radius-card)"
      data-testid={testId}
      style={{ background: 'var(--surface-2, var(--surface))', borderColor: 'var(--border)' }}
    >
      <Text fz={11} tt="uppercase" style={{ color: 'var(--ink-3)' }}>
        {label}
      </Text>
      <BalanceBadge balance={balance} size="md" />
    </Paper>
  );
}

export function PaymentsTab({ patientId }: { patientId: string }) {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const query = usePatientPayments(patientId, page);
  const balanceQuery = usePatientBalance(patientId);
  const plansQuery = usePatientPlanTitles(patientId);
  const planTitles = new Map((plansQuery.data ?? []).map((p) => [p.id, p.title]));

  if (query.isLoading) return <StateView status="loading" skeleton="table" />;
  // CLI-456: xato holati avval "bo'sh" bilan bir xil ko'rinardi (faqat isLoading
  // tekshirilardi) — endi StateView status="error" + retry (refetch chaqiradi).
  if (query.isError) {
    return (
      <StateView
        status="error"
        title={t('states.error_title')}
        retryLabel={t('states.retry')}
        onRetry={() => query.refetch()}
      />
    );
  }

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;
  const locale = i18n.language === 'ru' ? 'ru-RU' : 'uz-UZ';

  if (rows.length === 0) {
    return (
      <Paper
        withBorder
        p="xl"
        radius="var(--radius-card)"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <Text c="dimmed">{t('patients.payments_empty')}</Text>
      </Paper>
    );
  }

  return (
    <Paper
      withBorder
      p={0}
      radius="var(--radius-card)"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      <Group justify="space-between" px={18} py={16} wrap="nowrap">
        <Text fw={600} style={{ color: 'var(--ink)' }}>
          {t('patients.tab.payments')}
        </Text>
      </Group>

      {balanceQuery.data && (
        <SimpleGrid cols={{ base: 1, sm: 3 }} px={18} pb={16}>
          <FinanceCard
            testId="finance-plan-debt"
            label={t('patients.finance.plan_debt')}
            balance={balanceQuery.data.planDebt}
          />
          <FinanceCard
            testId="finance-non-plan"
            label={t('patients.finance.non_plan')}
            balance={balanceQuery.data.nonPlanBalance}
          />
          <FinanceCard
            testId="finance-total"
            label={t(
              balanceQuery.data.balance < 0
                ? 'patients.finance.total_credit'
                : 'patients.finance.total',
            )}
            balance={balanceQuery.data.balance}
          />
        </SimpleGrid>
      )}

      <Stack gap={0}>
        {rows.map((tx) => (
          <Group
            key={tx.id}
            justify="space-between"
            wrap="nowrap"
            px={18}
            py={14}
            style={{ borderTop: '1px solid var(--border)' }}
          >
            <Group gap={14} wrap="nowrap" style={{ minWidth: 0 }}>
              <Mono>{new Date(tx.createdAt).toLocaleDateString(locale)}</Mono>
              <Stack gap={2} style={{ minWidth: 0 }}>
                <Text fz={13} truncate style={{ color: 'var(--ink)' }}>
                  {tx.receiptNumber ? <Mono>{tx.receiptNumber}</Mono> : '—'}
                </Text>
                <Text fz={12} style={{ color: 'var(--ink-3)' }}>
                  {t(`cashier.method.${tx.paymentMethod}`)}
                </Text>
                {tx.treatmentPlanId && planTitles.get(tx.treatmentPlanId) && (
                  <Text fz={12} truncate style={{ color: 'var(--ink-3)' }}>
                    {planTitles.get(tx.treatmentPlanId)}
                  </Text>
                )}
              </Stack>
            </Group>
            <Group gap={12} wrap="nowrap" align="center">
              <Badge variant="light" color={tx.type === 'refund' ? 'red' : 'green'}>
                {t(`cashier.type.${tx.type}`)}
              </Badge>
              <Badge variant="outline" color="gray">
                {t(`patients.finance.status.${tx.status}`)}
              </Badge>
              <Mono>
                {tx.type === 'refund' ? '−' : ''}
                {formatNumber(Number(tx.paidAmount))} {tx.currency}
              </Mono>
            </Group>
          </Group>
        ))}
      </Stack>

      {meta && meta.total > (meta.pageSize || PATIENT_PAYMENTS_PAGE_SIZE) && (
        <Group justify="center" p={14} style={{ borderTop: '1px solid var(--border)' }}>
          <Pagination
            total={Math.ceil(meta.total / (meta.pageSize || PATIENT_PAYMENTS_PAGE_SIZE))}
            value={page}
            onChange={setPage}
          />
        </Group>
      )}
    </Paper>
  );
}
