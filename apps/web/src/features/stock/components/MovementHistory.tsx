import type { StockMovement } from '@dental/api-client';
import { Badge, Button, Stack, Table, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  formatMovementDateTime,
  formatQty,
  movementReasonLabel,
  toStockMovementVM,
} from '../stock.mappers';
import type { StockMovementType } from '../stock.types';

const TYPE_COLOR: Record<StockMovementType, string> = {
  in: 'teal',
  out: 'orange',
  adjustment: 'blue',
};

export interface MovementHistoryProps {
  itemName: string | null;
  movements: StockMovement[];
  /** Keyingi sahifa bor (FX-168) — «Ko'proq yuklash» tugmasi. */
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}

export function MovementHistory({
  itemName,
  movements,
  hasMore,
  onLoadMore,
  loadingMore,
}: MovementHistoryProps) {
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
        <Table.ScrollContainer minWidth={600}>
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
                  <Table.Td>{movementReasonLabel(m, t)}</Table.Td>
                  <Table.Td>{formatMovementDateTime(m.createdAt)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {hasMore && onLoadMore && (
        <Button variant="default" size="xs" onClick={onLoadMore} loading={loadingMore}>
          {t('stock.load_more')}
        </Button>
      )}
    </Stack>
  );
}
