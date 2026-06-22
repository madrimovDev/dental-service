import type { DailySummary } from '@dental/api-client';
import { Box, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatNumber } from '@/lib/format';

export interface DailySummaryCardProps {
  summary: DailySummary;
}

/** Stat box uchun naqd/karta ulushi — faqat displey, mavjud breakdown'dan (yangi hisob-kitob yo'q). */
function sumByMethod(summary: DailySummary, method: 'cash' | 'card'): number {
  return summary.breakdown
    .filter((b) => b.type === 'payment' && b.paymentMethod === method)
    .reduce((acc, b) => acc + Number(b.total), 0);
}

export function DailySummaryCard({ summary }: DailySummaryCardProps) {
  const { t } = useTranslation();

  // Faqat to'lovlar (gross) — refund/void hisobga olinmaydi (mapper QULF, displey-only).
  const cashAmount = sumByMethod(summary, 'cash');
  const cardAmount = sumByMethod(summary, 'card');
  const totalRevenue = summary.breakdown
    .filter((b) => b.type === 'payment')
    .reduce((acc, b) => acc + Number(b.total), 0);
  const cashShare = totalRevenue > 0 ? Math.round((cashAmount / totalRevenue) * 100) : 0;
  const cardShare = totalRevenue > 0 ? Math.round((cardAmount / totalRevenue) * 100) : 0;

  return (
    <Paper withBorder radius={16} p="lg" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <Stack gap="sm">
        <Title order={4}>
          <IconChartBar size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {t('cashier.daily_summary')}
        </Title>

        {summary.breakdown.length === 0 ? (
          <Text c="dimmed">{t('cashier.no_transactions_today')}</Text>
        ) : (
          <Stack gap="sm">
            {/* Jami tushum (stub kalit — Task F: cashier.total_revenue). */}
            <Box>
              <Text style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {t('cashier.total_revenue')}
              </Text>
              <Text
                fw={700}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--primary)' }}
              >
                {formatCurrency(totalRevenue, t)}
              </Text>
            </Box>

            <Group gap="sm" grow align="stretch">
              <StatBox
                label={t('cashier.method.cash')}
                share={cashShare}
                amount={formatCurrency(cashAmount, t)}
              />
              <StatBox
                label={t('cashier.method.card')}
                share={cardShare}
                amount={formatCurrency(cardAmount, t)}
              />
            </Group>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function StatBox({ label, share, amount }: { label: string; share: number; amount: string }) {
  return (
    <Box
      style={{
        flex: 1,
        background: 'var(--surface-2)',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <Group justify="space-between" gap={4} wrap="nowrap">
        <Text style={{ fontSize: 12, color: 'var(--ink-2)' }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-3)' }}>
          {formatNumber(share)}%
        </Text>
      </Group>
      <Text fw={600} style={{ fontFamily: 'var(--font-mono)', fontSize: 14, marginTop: 2 }}>
        {amount}
      </Text>
    </Box>
  );
}
