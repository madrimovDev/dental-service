import type { DailySummary } from '@dental/api-client';
import { Box, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconChartBar, IconCornerDownLeft } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatNumber } from '@/lib/format';
import { summarizeBreakdown } from '../cashier.mappers';
import { CARD_PROVIDERS } from '../cashier.types';

export interface DailySummaryCardProps {
  summary: DailySummary;
}

export function DailySummaryCard({ summary }: DailySummaryCardProps) {
  const { t } = useTranslation();

  // CLI-419/P13: har usul bo'yicha SOF (payment − refund) — `summarizeBreakdown`
  // `netCashTotal` bilan bir xil formula. UI-R5: karta sub-turlar bo'yicha bo'linadi.
  const sum = summarizeBreakdown(summary.breakdown);
  const cashNet = sum.cash;
  const cardNet = sum.card;
  const totalRefund = sum.refunded;
  const totalRevenue = sum.net;
  const cashShare = totalRevenue > 0 ? Math.round((cashNet / totalRevenue) * 100) : 0;
  const cardShare = totalRevenue > 0 ? Math.round((cardNet / totalRevenue) * 100) : 0;
  // Sub-tur qatorlari: faqat kamida bitta sub-tur ko'rsatilgan bo'lsa.
  const hasProviders = CARD_PROVIDERS.some((p) => (sum.cardByProvider[p] ?? 0) !== 0);
  const providerRows = [...CARD_PROVIDERS, 'unspecified' as const]
    .map((p) => ({ key: p, amount: sum.cardByProvider[p] ?? 0 }))
    .filter((r) => r.amount !== 0);

  // CLI-453 #1: hardcoded til-ternary o'rniga i18n kaliti (uz.json/ru.json qo'shildi).
  const cashOutLabel = t('cashier.cash_out');

  return (
    <Paper withBorder radius="var(--radius-card)" p="lg" style={{ boxShadow: 'var(--shadow-sm)' }}>
      <Stack gap="sm">
        <Title order={4}>
          <IconChartBar size={18} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          {t('cashier.daily_summary')}
        </Title>

        {summary.breakdown.length === 0 ? (
          <Text c="dimmed">{t('cashier.no_transactions_today')}</Text>
        ) : (
          <Stack gap="sm">
            {/* Jami tushum (stub kalit — Task F: cashier.total_revenue). Endi SOF
                (Σ payment − Σ refund), avval faqat gross to'lov edi. */}
            <Box>
              <Text style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                {t('cashierPos.summary.net')}
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
                amount={formatCurrency(cashNet, t)}
              />
              <StatBox
                label={t('cashier.method.card')}
                share={cardShare}
                amount={formatCurrency(cardNet, t)}
              />
            </Group>

            {hasProviders && (
              <Stack gap={4} data-testid="card-providers" style={{ paddingLeft: 12 }}>
                {providerRows.map((r) => (
                  <Group key={r.key} justify="space-between" wrap="nowrap">
                    <Text style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                      {t(`cashierPos.provider.${r.key}`)}
                    </Text>
                    <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>
                      {formatCurrency(r.amount, t)}
                    </Text>
                  </Group>
                ))}
              </Stack>
            )}

            {sum.transfer !== 0 && (
              <Group justify="space-between" wrap="nowrap" style={{ padding: '0 12px' }}>
                <Text style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  {t('cashierPos.summary.transfer')}
                </Text>
                <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>
                  {formatCurrency(sum.transfer, t)}
                </Text>
              </Group>
            )}
            {sum.other !== 0 && (
              <Group justify="space-between" wrap="nowrap" style={{ padding: '0 12px' }}>
                <Text style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  {t('cashierPos.summary.other')}
                </Text>
                <Text style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>
                  {formatCurrency(sum.other, t)}
                </Text>
              </Group>
            )}

            {totalRefund > 0 && (
              <Box
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--danger-bg)',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                <Group gap={6} wrap="nowrap">
                  <IconCornerDownLeft size={14} style={{ color: 'var(--danger)' }} />
                  <Text style={{ fontSize: 12, color: 'var(--ink-2)' }}>{cashOutLabel}</Text>
                </Group>
                <Text
                  fw={600}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    color: 'var(--danger)',
                  }}
                >
                  −{formatCurrency(totalRefund, t)}
                </Text>
              </Box>
            )}

            <Text style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
              {t('cashierPos.summary.refund_note')}
            </Text>

            {/* CLI-452: backend `expense.view` bo'lmasa bu maydonlarni umuman
                qaytarmaydi — shunda qator ko'rsatilmaydi (403/xato YO'Q, jim
                yashirin). `summary.expensesTotal !== undefined` — 0 qiymatni
                ham to'g'ri ko'rsatish uchun (falsy 0 emas, presence tekshiruvi). */}
            {summary.expensesTotal !== undefined && (
              <Box
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--surface-2)',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                <Text style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                  {t('cashier.expenses_total')}
                </Text>
                <Text fw={600} style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                  −{formatCurrency(summary.expensesTotal, t)}
                </Text>
              </Box>
            )}

            {summary.netCashFlow !== undefined && (
              <Box
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>
                  {t('cashier.net_cash_flow')}
                </Text>
                <Text
                  fw={700}
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 16,
                    color: summary.netCashFlow < 0 ? 'var(--danger)' : 'var(--primary)',
                  }}
                >
                  {formatCurrency(summary.netCashFlow, t)}
                </Text>
              </Box>
            )}
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
