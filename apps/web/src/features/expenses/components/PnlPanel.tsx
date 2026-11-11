import { Alert, Box, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import type { PnlDto } from '../expenses.types';

type Tile = { key: string; label: string; value: string; hint: string; tone?: 'danger' | 'net' };

/** Foyda va zarar: sof foyda = tushum − xarajat − ish haqi (4 plitka, kanvas Finance.dc). */
export function PnlPanel({ pnl }: { pnl: PnlDto }) {
  const { t } = useTranslation();
  const money = (n: number) => formatCurrency(n, t);
  const minus = (n: number) => (n === 0 ? formatCurrency(0, t) : `−${formatCurrency(n, t)}`);

  const payrollHint = !pnl.payrollIncluded
    ? t('finance.payrollBranchHint')
    : pnl.payrollDraft && pnl.payrollDraft > 0
      ? t('finance.payrollDraftHint', { count: pnl.payrollRunCount })
      : t('finance.payrollFinalHint', { count: pnl.payrollRunCount });

  const tiles: Tile[] = [
    {
      key: 'revenue',
      label: t('finance.netRevenue'),
      value: money(pnl.revenue),
      hint: t('finance.netRevenueHint'),
    },
    {
      key: 'expenses',
      label: t('finance.expenses'),
      value: minus(pnl.expenses),
      hint: t('finance.expensesHint'),
      tone: 'danger',
    },
    {
      key: 'payroll',
      label: t('finance.payroll'),
      value: pnl.payroll === null ? '—' : minus(pnl.payroll),
      hint: payrollHint,
      tone: 'danger',
    },
    {
      key: 'net',
      label: t('finance.netProfit'),
      value: money(pnl.netProfit),
      hint: t('finance.netProfitHint'),
      tone: 'net',
    },
  ];

  return (
    <Stack gap="sm" data-testid="pnl-panel">
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {tiles.map((tile) => (
          <Box
            key={tile.key}
            data-testid={`pnl-${tile.key}`}
            p="md"
            style={{
              background: tile.tone === 'net' ? 'var(--primary-soft)' : 'var(--surface)',
              border: tile.tone === 'net' ? '2px solid var(--primary)' : '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            <Text size="sm" c="dimmed">
              {tile.label}
            </Text>
            <Text
              fz={24}
              ff="var(--font-mono, monospace)"
              c={
                tile.tone === 'danger'
                  ? 'var(--danger)'
                  : tile.tone === 'net'
                    ? 'var(--primary)'
                    : undefined
              }
            >
              {tile.value}
            </Text>
            <Text size="xs" c="dimmed">
              {tile.hint}
            </Text>
          </Box>
        ))}
      </SimpleGrid>
      {!pnl.payrollIncluded && (
        <Alert color="yellow" variant="light" data-testid="pnl-branch-note">
          {t('finance.branchNote')}
        </Alert>
      )}
    </Stack>
  );
}
