import type { DailySummary } from '@dental/api-client';
import { Box, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconChartBar, IconCornerDownLeft } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatNumber } from '@/lib/format';

export interface DailySummaryCardProps {
  summary: DailySummary;
}

/** Berilgan metod+type bo'yicha breakdown yig'indisi (displey-only agregatsiya). */
function sumByMethodAndType(
  summary: DailySummary,
  method: 'cash' | 'card',
  type: 'payment' | 'refund',
): number {
  return summary.breakdown
    .filter((b) => b.type === type && b.paymentMethod === method)
    .reduce((acc, b) => acc + Number(b.total), 0);
}

function sumByType(summary: DailySummary, type: 'payment' | 'refund'): number {
  return summary.breakdown
    .filter((b) => b.type === type)
    .reduce((acc, b) => acc + Number(b.total), 0);
}

export function DailySummaryCard({ summary }: DailySummaryCardProps) {
  const { t, i18n } = useTranslation();

  // CLI-419: backend `dailySummary` endi `SUM(paidAmount)` qaytaradi (hisob-faktura
  // emas, haqiqatda olingan naqd). Frontend HAM refundlarni endi e'tiborsiz
  // qoldirmaydi — har metod bo'yicha SOF (payment − refund) ko'rsatiladi + refund
  // bo'lsa ko'rinadigan kassa-chiqim qatori (avval faqat gross to'lov ko'rsatilardi).
  const cashPayment = sumByMethodAndType(summary, 'cash', 'payment');
  const cashRefund = sumByMethodAndType(summary, 'cash', 'refund');
  const cashNet = cashPayment - cashRefund;
  const cardPayment = sumByMethodAndType(summary, 'card', 'payment');
  const cardRefund = sumByMethodAndType(summary, 'card', 'refund');
  const cardNet = cardPayment - cardRefund;

  const totalPayment = sumByType(summary, 'payment');
  const totalRefund = sumByType(summary, 'refund');
  const totalRevenue = totalPayment - totalRefund;
  const cashShare = totalRevenue > 0 ? Math.round((cashNet / totalRevenue) * 100) : 0;
  const cardShare = totalRevenue > 0 ? Math.round((cardNet / totalRevenue) * 100) : 0;

  // TODO i18n key: cashier.cash_out (packages/i18n bu pass'da tegilmagan — handoff,
  // uz.json/ru.json'ga qo'shilishi kerak).
  const cashOutLabel =
    i18n.language === 'ru' ? 'Возврат наличных (расход)' : 'Naqd chiqim (refund)';

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
                amount={formatCurrency(cashNet, t)}
              />
              <StatBox
                label={t('cashier.method.card')}
                share={cardShare}
                amount={formatCurrency(cardNet, t)}
              />
            </Group>

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
