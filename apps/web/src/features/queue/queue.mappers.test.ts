import type { QueueTicket } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import { groupByStatus, toQueueCardVM } from './queue.mappers';
import type { QueueLookups } from './queue.types';

function ticket(over: Partial<QueueTicket> = {}): QueueTicket {
  return {
    id: 't1',
    tenantId: 't',
    branchId: 'b',
    patientId: 'p1',
    serviceId: 's1',
    doctorId: null,
    appointmentId: null,
    queueNumber: 1,
    ticketDate: '2026-06-11T00:00:00Z',
    status: 'waiting',
    calledAt: null,
    finishedAt: null,
    createdAt: '2026-06-11T05:00:00Z',
    ...over,
  };
}

const lookups: QueueLookups = {
  patientNameById: new Map([['p1', 'Ali Valiyev']]),
  serviceNameById: new Map([['s1', 'Konsultatsiya']]),
};

describe('queue.mappers', () => {
  it('toQueueCardVM: nom va xizmatni lookupdan oladi', () => {
    const vm = toQueueCardVM(ticket(), lookups);
    expect(vm.patientName).toBe('Ali Valiyev');
    expect(vm.serviceName).toBe('Konsultatsiya');
    expect(vm.queueNumber).toBe(1);
  });

  it('toQueueCardVM: nom topilmasa fallback "—"', () => {
    const vm = toQueueCardVM(ticket({ patientId: 'x', serviceId: null }), lookups);
    expect(vm.patientName).toBe('—');
    expect(vm.serviceName).toBeNull();
  });

  it('groupByStatus: waiting / in_progress / completed(done+missed)', () => {
    const cols = groupByStatus([
      ticket({ id: 'a', status: 'waiting' }),
      ticket({ id: 'b', status: 'in_progress' }),
      ticket({ id: 'c', status: 'done' }),
      ticket({ id: 'd', status: 'missed' }),
    ]);
    expect(cols.find((c) => c.key === 'waiting')?.tickets).toHaveLength(1);
    expect(cols.find((c) => c.key === 'in_progress')?.tickets).toHaveLength(1);
    expect(cols.find((c) => c.key === 'completed')?.tickets).toHaveLength(2);
  });
});
