import type { QueueStatus } from '@dental/api-client';
import { Card, Stack, Text } from '@mantine/core';
import { toQueueCardVM } from '../queue.mappers';
import type { QueueColumnKey, QueueColumnVM, QueueLookups } from '../queue.types';
import { QueueCard } from './QueueCard';

const titleKey: Record<QueueColumnKey, string> = {
  waiting: 'queue.waiting',
  in_progress: 'queue.in_progress',
  completed: 'queue.completed',
};

export function QueueColumn({
  column,
  title,
  lookups,
  canManage,
  onStatus,
}: {
  column: QueueColumnVM;
  title: string;
  lookups: QueueLookups;
  canManage: boolean;
  onStatus: (id: string, status: QueueStatus) => void;
}) {
  return (
    <Card withBorder padding="md" radius="md" style={{ flex: 1 }}>
      <Stack gap="sm">
        <Text fw={600} size="lg">
          {title} ({column.tickets.length})
        </Text>
        {column.tickets.length === 0 && (
          <Text c="dimmed" size="sm">
            —
          </Text>
        )}
        {column.tickets.map((ticket) => (
          <QueueCard
            key={ticket.id}
            vm={toQueueCardVM(ticket, lookups)}
            canManage={canManage}
            onStatus={(status) => onStatus(ticket.id, status)}
          />
        ))}
      </Stack>
    </Card>
  );
}

export { titleKey };
