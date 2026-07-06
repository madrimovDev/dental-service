import type { QueueStatus } from '@dental/api-client';
import { toQueueCardVM } from '../queue.mappers';
import type { QueueColumnKey, QueueColumnVM, QueueLookups } from '../queue.types';
import { QueueCard } from './QueueCard';
import classes from './QueueColumn.module.css';

const titleKey: Record<QueueColumnKey, string> = {
  waiting: 'queue.waiting',
  in_progress: 'queue.in_progress',
  completed: 'queue.completed',
};

/** Count chip toni — ustun kalitidan deriva qilinadi. */
const countTone: Record<QueueColumnKey, 'muted' | 'warning' | 'success'> = {
  waiting: 'muted',
  in_progress: 'warning',
  completed: 'success',
};

export function QueueColumn({
  column,
  title,
  lookups,
  canManage,
  busyId,
  onStatus,
}: {
  column: QueueColumnVM;
  title: string;
  lookups: QueueLookups;
  canManage: boolean;
  busyId?: string;
  onStatus: (id: string, status: QueueStatus) => void;
}) {
  return (
    <div className={classes.column}>
      <div className={classes.header}>
        <span className={classes.title}>{title}</span>
        <span className={classes.countChip} data-tone={countTone[column.key]}>
          {column.tickets.length}
        </span>
      </div>
      <div className={classes.body}>
        {column.tickets.length === 0 && <span className={classes.empty}>—</span>}
        {column.tickets.map((ticket) => (
          <QueueCard
            key={ticket.id}
            vm={toQueueCardVM(ticket, lookups)}
            canManage={canManage}
            busy={busyId === ticket.id}
            onStatus={(status) => onStatus(ticket.id, status)}
          />
        ))}
      </div>
    </div>
  );
}

export { titleKey };
