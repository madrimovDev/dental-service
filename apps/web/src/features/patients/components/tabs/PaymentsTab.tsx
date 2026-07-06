import { Mono } from '@dental/ui';
import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { BalanceBadge } from '@/components/BalanceBadge';
import { formatNumber } from '@/lib/format';
import { usePatientBalance, usePatientPayments } from '../../patients.api';

export function PaymentsTab({ patientId }: { patientId: string }) {
  const { t, i18n } = useTranslation();
  const query = usePatientPayments(patientId);
  const balanceQuery = usePatientBalance(patientId);

  if (query.isLoading) return <Text>{t('common.loading')}</Text>;

  const rows = query.data?.data ?? [];
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
        {balanceQuery.data && (
          <Group gap={6} wrap="nowrap" align="baseline">
            <Text fz={11} tt="uppercase" style={{ color: 'var(--ink-3)' }}>
              {t('patients.balance')}
            </Text>
            <BalanceBadge balance={balanceQuery.data.balance} size="md" />
          </Group>
        )}
      </Group>

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
              </Stack>
            </Group>
            <Group gap={12} wrap="nowrap" align="center">
              <Badge variant="light" color={tx.type === 'refund' ? 'red' : 'green'}>
                {tx.status}
              </Badge>
              <Mono>
                {tx.type === 'refund' ? '−' : ''}
                {formatNumber(Number(tx.paidAmount))} {tx.currency}
              </Mono>
            </Group>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}
