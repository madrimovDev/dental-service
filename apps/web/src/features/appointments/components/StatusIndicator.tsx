import { Check } from 'lucide-react';
import type { AppointmentStatus } from '../appointments.types';
import classes from './StatusIndicator.module.css';

/**
 * Status → indikator (Dental OS spec §4). Blok ichida (o'ng-yuqori) va legend'da
 * bir manbadan keladi → vizual drift yo'q. Root'da `data-status` (test uchun).
 *
 * | scheduled   | halqa (ring) ink-3                                |
 * | confirmed   | to'la dot ink-3                                  |
 * | in_progress | to'la dot warning + warning-soft halqa (pulse)  |
 * | completed   | check ikonka ink-3                               |
 * | no_show     | to'la dot danger                                 |
 * | cancelled   | dim/qiya dot ink-3                               |
 */
export function StatusIndicator({
  status,
  size = 12,
}: {
  status: AppointmentStatus;
  size?: number;
}) {
  if (status === 'completed') {
    return (
      <span
        className={classes.root}
        data-status={status}
        data-kind="check"
        style={{ width: size, height: size }}
      >
        <Check size={size} strokeWidth={2.5} className={classes.check} aria-hidden />
      </span>
    );
  }

  // dot / ring variantlar — CSS data-status modifikatorlari rang/shaklni beradi
  return (
    <span
      className={classes.root}
      data-status={status}
      data-kind={status === 'scheduled' ? 'ring' : 'dot'}
      style={{ width: size, height: size }}
    >
      <span className={classes.dot} />
    </span>
  );
}
