import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';

/** Balans ko'rsatkichi: qarz qizil (+), kredit yashil (−), 0 dimmed. */
export function BalanceBadge({ balance, size = 'sm' }: { balance: number; size?: string }) {
  const { t } = useTranslation();

  if (balance === 0) {
    return (
      <Text size={size} c="dimmed">
        {formatCurrency(0, t)}
      </Text>
    );
  }

  const isDebt = balance > 0;
  return (
    <Text size={size} fw={600} c={isDebt ? 'red' : 'teal'}>
      {isDebt ? '' : '−'}
      {formatCurrency(Math.abs(balance), t)}{' '}
      <Text span size="xs" c="dimmed">
        {isDebt ? t('patients.balance_debt') : t('patients.balance_credit')}
      </Text>
    </Text>
  );
}
