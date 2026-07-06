import { StatusPill } from '@dental/ui';
import { Button, Table, Text } from '@mantine/core';
import { IconArrowsExchange } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format.ts';
import { formatQty } from '../stock.mappers';
import type { StockItemVM } from '../stock.types';

export interface StockItemsTableProps {
  items: StockItemVM[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  canManage: boolean;
  onMovement: (item: StockItemVM) => void;
}

export function StockItemsTable({
  items,
  selectedId,
  onSelect,
  canManage,
  onMovement,
}: StockItemsTableProps) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <Text c="dimmed">{t('stock.empty')}</Text>;
  }

  return (
    <Table.ScrollContainer minWidth={750}>
      <Table verticalSpacing="xs" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('stock.item_name')}</Table.Th>
            <Table.Th>{t('stock.category')}</Table.Th>
            <Table.Th>{t('stock.unit')}</Table.Th>
            <Table.Th>{t('stock.quantity')}</Table.Th>
            <Table.Th>{t('stock.min_threshold')}</Table.Th>
            <Table.Th>{t('stock.price')}</Table.Th>
            <Table.Th>{t('stock.status')}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => (
            <Table.Tr
              key={item.id}
              tabIndex={0}
              onClick={() => onSelect(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(item.id);
                }
              }}
              style={{ cursor: 'pointer' }}
              bg={selectedId === item.id ? 'var(--primary-soft)' : undefined}
            >
              <Table.Td>{item.name}</Table.Td>
              <Table.Td>{item.category ?? <Text c="dimmed">—</Text>}</Table.Td>
              <Table.Td>{item.unit}</Table.Td>
              <Table.Td>
                <Text fw={600} c={item.stockState === 'low' ? 'var(--danger)' : undefined}>
                  {formatQty(item.quantity)}
                </Text>
              </Table.Td>
              <Table.Td>{formatQty(item.minThreshold)}</Table.Td>
              <Table.Td>
                {item.price == null ? <Text c="dimmed">—</Text> : formatCurrency(item.price, t)}
              </Table.Td>
              <Table.Td>
                {item.stockState === 'low' ? (
                  <StatusPill status="danger">{t('stock.low')}</StatusPill>
                ) : (
                  <StatusPill status="success">{t('stock.ok')}</StatusPill>
                )}
              </Table.Td>
              <Table.Td>
                {canManage && (
                  <Button
                    size="compact-xs"
                    variant="light"
                    leftSection={<IconArrowsExchange size={14} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMovement(item);
                    }}
                  >
                    {t('stock.movement')}
                  </Button>
                )}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
