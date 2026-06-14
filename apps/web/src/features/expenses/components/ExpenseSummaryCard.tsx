import { Paper, Stack, Table, Text, Title } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import type { SummaryRowVM } from '../expenses.types';

export interface ExpenseSummaryCardProps {
  rows: SummaryRowVM[];
  grandTotal: number;
}

export function ExpenseSummaryCard({ rows, grandTotal }: ExpenseSummaryCardProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="xs">
        <Title order={4}>
          <IconChartBar size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {t('expenses.summary_title')}
        </Title>
        {rows.length === 0 ? (
          <Text c="dimmed">{t('expenses.empty')}</Text>
        ) : (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('expenses.category')}</Table.Th>
                <Table.Th>{t('expenses.count')}</Table.Th>
                <Table.Th>{t('expenses.total')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr key={r.categoryId ?? '__uncategorized__'}>
                  <Table.Td>{r.categoryName}</Table.Td>
                  <Table.Td>{r.count}</Table.Td>
                  <Table.Td fw={600}>{formatCurrency(r.total, t)}</Table.Td>
                </Table.Tr>
              ))}
              <Table.Tr>
                <Table.Td fw={700}>{t('expenses.grand_total')}</Table.Td>
                <Table.Td />
                <Table.Td fw={700}>{formatCurrency(grandTotal, t)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        )}
      </Stack>
    </Paper>
  );
}
