import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../../../test-utils';
import type { Appointment, Doctor } from '../appointments.types';
import { CalendarGrid } from './CalendarGrid';

const doctors: Doctor[] = [{ id: 'd1', name: 'Dr. Ali' }];
const appts: Appointment[] = [
  {
    id: 'a1',
    tenantId: 't',
    branchId: 'b',
    patientId: 'p1',
    doctorId: 'd1',
    assistantId: null,
    startTime: '2026-06-10T05:00:00Z',
    endTime: '2026-06-10T05:30:00Z',
    status: 'scheduled',
    serviceIds: [],
    notes: null,
    cancellationReason: null,
    createdAt: '',
    updatedAt: '',
  },
];

describe('CalendarGrid', () => {
  it("doktor ustuni va slotni ko'rsatadi", () => {
    renderApp(
      <CalendarGrid
        appointments={appts}
        doctors={doctors}
        patientName={() => 'Bemor X'}
        onSlotClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Dr. Ali')).toBeInTheDocument();
    expect(screen.getByText(/Bemor X/)).toBeInTheDocument();
  });
});
