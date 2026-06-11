import type { DailySummary } from '@dental/api-client';
import { Badge, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

const formatUZS = (n: string | number) =>
  `${new Intl.NumberFormat('uz-UZ').format(typeof n === 'string' ? Number(n) : n)} so'm`;

export interface DailySummaryCardProps {
  summary: DailySummary;
}

export function DailySummaryCard({ summary }: DailySummaryCardProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="xs">
        <Title order={4}>
          <IconChartBar size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {t('cashier.daily_summary')}
        </Title>
        {summary.breakdown.length === 0 ? (
          <Text c="dimmed">{t('cashier.no_transactions_today')}</Text>
        ) : (
          <Table>
            <Table.Tbody>
              {summary.breakdown.map((b) => (
                <Table.Tr key={`${b.paymentMethod}-${b.type}`}>
                  <Table.Td>{t(`cashier.method.${b.paymentMethod}`)}</Table.Td>
                  <Table.Td>
                    <Badge color={b.type === 'refund' ? 'red' : 'teal'}>
                      {t(`cashier.type.${b.type}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{b.count}</Table.Td>
                  <Table.Td fw={600}>{formatUZS(b.total)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}
