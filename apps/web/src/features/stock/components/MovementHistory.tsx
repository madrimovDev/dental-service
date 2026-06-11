import type { StockMovement } from '@dental/api-client';
import { Badge, Stack, Table, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatQty, toStockMovementVM } from '../stock.mappers';
import type { StockMovementType } from '../stock.types';

const TYPE_COLOR: Record<StockMovementType, string> = {
  in: 'teal',
  out: 'orange',
  adjustment: 'blue',
};

export interface MovementHistoryProps {
  itemName: string | null;
  movements: StockMovement[];
}

export function MovementHistory({ itemName, movements }: MovementHistoryProps) {
  const { t } = useTranslation();

  if (!itemName) {
    return <Text c="dimmed">{t('stock.select_item')}</Text>;
  }

  const vms = movements.map(toStockMovementVM);

  return (
    <Stack gap="sm">
      <Title order={5}>
        {t('stock.history_for')}: {itemName}
      </Title>
      {vms.length === 0 ? (
        <Text c="dimmed">{t('stock.no_movements')}</Text>
      ) : (
        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('stock.type')}</Table.Th>
              <Table.Th>{t('stock.quantity')}</Table.Th>
              <Table.Th>{t('stock.reason')}</Table.Th>
              <Table.Th>{t('stock.date')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {vms.map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td>
                  <Badge color={TYPE_COLOR[m.type]} size="sm" variant="light">
                    {t(`stock.type_label.${m.type}`)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {m.type === 'out' ? '−' : m.type === 'in' ? '+' : ''}
                  {formatQty(m.quantity)}
                </Table.Td>
                <Table.Td>
                  {m.sourceVisitNoteId ? t('stock.reason_visit') : (m.reason ?? '—')}
                </Table.Td>
                <Table.Td>{new Date(m.createdAt).toLocaleDateString('uz-UZ')}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
