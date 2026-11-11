import type { LabOrderStatus } from '@dental/api-client';
import { useTranslation } from 'react-i18next';
import classes from './LabOrderForm.module.css';

const CHAIN: LabOrderStatus[] = ['sent', 'in_progress', 'ready', 'delivered'];

/**
 * Buyurtma holat zanjiri (forward-only: yuborildi → tayyorlanmoqda → tayyor → yetkazildi).
 * `current` berilsa o'tgan qadamlar to'ldiriladi, joriysi ajratiladi (holat faqat rangda emas —
 * har qadamda matn bor).
 */
export function LabOrderChain({ current }: { current?: LabOrderStatus }) {
  const { t } = useTranslation();
  const idx = current ? CHAIN.indexOf(current) : -1;
  return (
    <ol className={classes.chain}>
      {CHAIN.map((s, i) => {
        const state = idx < 0 ? 'todo' : i < idx ? 'done' : i === idx ? 'current' : 'todo';
        return (
          <li key={s} className={classes.step} data-state={state}>
            <span className={classes.stepDot} aria-hidden="true" />
            <div>
              <div className={classes.stepName}>{t(`lab_order.status_${s}`)}</div>
              <div className={classes.stepHint}>{t(`labOrder.chain_${s}`)}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
