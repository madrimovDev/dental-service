import type { QueueTicket } from '@dental/api-client';
import type { QueueCardVM, QueueColumnKey, QueueColumnVM, QueueLookups } from './queue.types';

export function toQueueCardVM(ticket: QueueTicket, lookups: QueueLookups): QueueCardVM {
  return {
    id: ticket.id,
    queueNumber: ticket.queueNumber,
    status: ticket.status,
    patientName: ticket.patientId ? (lookups.patientNameById.get(ticket.patientId) ?? '—') : '—',
    serviceName: ticket.serviceId ? (lookups.serviceNameById.get(ticket.serviceId) ?? null) : null,
    createdAt: ticket.createdAt,
    calledAt: ticket.calledAt,
  };
}

const COLUMN_OF: Record<QueueTicket['status'], QueueColumnKey> = {
  waiting: 'waiting',
  in_progress: 'in_progress',
  done: 'completed',
  missed: 'completed',
};

const COLUMN_ORDER: QueueColumnKey[] = ['waiting', 'in_progress', 'completed'];

export function groupByStatus(tickets: QueueTicket[]): QueueColumnVM[] {
  return COLUMN_ORDER.map((key) => ({
    key,
    tickets: tickets.filter((t) => COLUMN_OF[t.status] === key),
  }));
}
