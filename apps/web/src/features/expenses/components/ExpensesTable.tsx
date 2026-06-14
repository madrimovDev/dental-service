import { ActionIcon, Table, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import type { ExpenseVM } from '../expenses.types';

export interface ExpensesTableProps {
  expenses: ExpenseVM[];
  canManage: boolean;
  onDelete: (expense: ExpenseVM) => void;
}

export function ExpensesTable({ expenses, canManage, onDelete }: ExpensesTableProps) {
  const { t } = useTranslation();

  if (expenses.length === 0) {
    return <Text c="dimmed">{t('expenses.empty')}</Text>;
  }

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t('expenses.date')}</Table.Th>
          <Table.Th>{t('expenses.category')}</Table.Th>
          <Table.Th>{t('expenses.amount')}</Table.Th>
          <Table.Th>{t('expenses.note')}</Table.Th>
          {canManage && <Table.Th w={48} />}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {expenses.map((e) => (
          <Table.Tr key={e.id}>
            <Table.Td>{e.date}</Table.Td>
            <Table.Td>{e.categoryName}</Table.Td>
            <Table.Td fw={600}>{formatCurrency(e.amount, t)}</Table.Td>
            <Table.Td c="dimmed">{e.note ?? '—'}</Table.Td>
            {canManage && (
              <Table.Td>
                <ActionIcon
                  color="red"
                  variant="subtle"
                  onClick={() => onDelete(e)}
                  aria-label={t('common.delete')}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Table.Td>
            )}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
