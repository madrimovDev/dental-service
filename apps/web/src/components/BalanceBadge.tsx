import { Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

const formatUZS = (n: number) => `${new Intl.NumberFormat('uz-UZ').format(Math.abs(n))} so'm`;

/** Balans ko'rsatkichi: qarz qizil (+), kredit yashil (−), 0 dimmed. */
export function BalanceBadge({ balance, size = 'sm' }: { balance: number; size?: string }) {
  const { t } = useTranslation();

  if (balance === 0) {
    return (
      <Text size={size} c="dimmed">
        {formatUZS(0)}
      </Text>
    );
  }

  const isDebt = balance > 0;
  return (
    <Text size={size} fw={600} c={isDebt ? 'red' : 'teal'}>
      {isDebt ? '' : '−'}
      {formatUZS(balance)}{' '}
      <Text span size="xs" c="dimmed">
        {isDebt ? t('patients.balance_debt') : t('patients.balance_credit')}
      </Text>
    </Text>
  );
}
