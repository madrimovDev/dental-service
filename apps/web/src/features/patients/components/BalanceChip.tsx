import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import classes from './PatientsListScreen.module.css';

/**
 * Feature-local balance chip for the patients list (Dental OS re-skin).
 * Does NOT replace the shared `BalanceBadge` (consumed by cashier / PatientCard /
 * PaymentsTab) — restyling that would leak into other screens (DS2 scope).
 *  - balance === 0 → "To'langan" muted tone
 *  - balance  > 0  → danger tone + amount + "qarz"
 *  - balance  < 0  → primary/teal tone + "−" + amount + "kredit"
 */
export function BalanceChip({ balance }: { balance: number }) {
  const { t } = useTranslation();

  if (balance === 0) {
    return (
      <span className={classes.balanceChip} data-tone="paid">
        {t('patients.balance_paid')}
      </span>
    );
  }

  const isDebt = balance > 0;
  return (
    <span className={classes.balanceChip} data-tone={isDebt ? 'debt' : 'credit'}>
      <span className={classes.balanceAmount}>
        {isDebt ? '' : '−'}
        {formatCurrency(Math.abs(balance), t)}
      </span>{' '}
      <span className={classes.balanceLabel}>
        {isDebt ? t('patients.balance_debt') : t('patients.balance_credit')}
      </span>
    </span>
  );
}
