import { Button, StatusPill } from '@dental/ui';
import { Table, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatQty } from '../stock.mappers';
import type { DaysState, StockItemVM } from '../stock.types';

export interface StockItemsTableProps {
  items: StockItemVM[];
  /** item.id → shu materialni ishlatadigan xizmat nomlari (BOM'dan). */
  servicesByItem?: Map<string, string[]>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  canManage: boolean;
  onMovement: (item: StockItemVM) => void;
  onReceive?: (item: StockItemVM) => void;
}

/** «Necha kunga yetadi» bar to'lishi uchun 60 kun = 100%. */
const BAR_FULL_DAYS = 60;
const MAX_SERVICES_SHOWN = 2;

const BAR_COLOR: Record<DaysState, string> = {
  critical: 'var(--danger)',
  soon: 'var(--warning)',
  ok: 'var(--primary)',
  none: 'var(--border-strong)',
};

function DaysCell({ item }: { item: StockItemVM }) {
  const { t } = useTranslation();
  if (item.daysLeft == null) {
    // Sarf yo'q → cheksiz: bo'linish yo'q, «—» (xato ham, ogohlantirish ham emas).
    return (
      <Text size="sm" c="dimmed" title={t('stockScreen.daysNoneHint')}>
        {t('stockScreen.daysNone')}
      </Text>
    );
  }
  const pct = Math.min(100, Math.round((item.daysLeft / BAR_FULL_DAYS) * 100));
  const label =
    item.daysState === 'critical'
      ? t('stockScreen.daysEnding', { count: item.daysLeft })
      : t('stockScreen.daysValue', { count: item.daysLeft });
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
      title={t('stockScreen.daysHint', {
        usage: formatQty(Number(item.avgDailyUsage.toFixed(2))),
        unit: item.unit,
      })}
    >
      <div
        aria-hidden="true"
        style={{
          width: 90,
          height: 8,
          borderRadius: 99,
          background: 'var(--border-subtle)',
          overflow: 'hidden',
          flex: '0 0 auto',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: BAR_COLOR[item.daysState] }} />
      </div>
      <Text
        size="sm"
        fw={item.daysState === 'ok' ? 400 : 700}
        c={
          item.daysState === 'critical'
            ? 'var(--danger)'
            : item.daysState === 'soon'
              ? 'var(--warning)'
              : undefined
        }
        data-days-state={item.daysState}
      >
        {label}
      </Text>
    </div>
  );
}

export function StockItemsTable({
  items,
  servicesByItem,
  selectedId,
  onSelect,
  canManage,
  onMovement,
  onReceive,
}: StockItemsTableProps) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <Text c="dimmed">{t('stock.empty')}</Text>;
  }

  return (
    <Table.ScrollContainer minWidth={680}>
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('stockScreen.colMaterial')}</Table.Th>
            <Table.Th ta="right">{t('stockScreen.colQty')}</Table.Th>
            <Table.Th>{t('stockScreen.colDays')}</Table.Th>
            <Table.Th>{t('stockScreen.colUsedIn')}</Table.Th>
            <Table.Th ta="right">{t('stockScreen.colAction')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => {
            const services = servicesByItem?.get(item.id) ?? [];
            const urgent = item.daysState === 'critical' || item.daysState === 'soon';
            return (
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
                <Table.Td>
                  <Text fw={600}>{item.name}</Text>
                  {item.category && (
                    <Text size="xs" c="dimmed">
                      {item.category}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td ta="right">
                  <Text fw={600} ff="monospace" c={item.lowStock ? 'var(--danger)' : undefined}>
                    {formatQty(item.quantity)} {item.unit}
                  </Text>
                  {item.stockState === 'low' && (
                    <StatusPill status="danger">{t('stock.low')}</StatusPill>
                  )}
                </Table.Td>
                <Table.Td>
                  <DaysCell item={item} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm">
                    {services.length === 0
                      ? t('stockScreen.usedInNone')
                      : services.slice(0, MAX_SERVICES_SHOWN).join(', ')}
                    {services.length > MAX_SERVICES_SHOWN &&
                      ` ${t('stockScreen.usedInMore', { count: services.length - MAX_SERVICES_SHOWN })}`}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    {canManage && onReceive && urgent ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onReceive(item);
                        }}
                      >
                        {t('stockScreen.actionReceive')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(item.id);
                        }}
                      >
                        {t('stockScreen.actionHistory')}
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMovement(item);
                        }}
                      >
                        {t('stockScreen.actionMovement')}
                      </Button>
                    )}
                  </div>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
