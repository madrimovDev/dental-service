import { within } from '@testing-library/dom';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test-utils';
import type { Appointment, AppointmentStatus } from '../appointments.types';
import { DayStatsCard } from './DayStatsCard';

function appt(id: string, status: AppointmentStatus): Appointment {
  return {
    id,
    tenantId: 't',
    branchId: 'b',
    patientId: 'p',
    doctorId: 'd',
    assistantId: null,
    startTime: '2026-06-10T05:00:00Z',
    endTime: '2026-06-10T05:30:00Z',
    status,
    serviceIds: [],
    notes: null,
    cancellationReason: null,
    createdAt: '',
    updatedAt: '',
  };
}

const value = (testid: string) =>
  within(screen.getByTestId(testid)).getByText(/^(\d+|—)$/).textContent;

describe('DayStatsCard', () => {
  it("appts'dan jami/tasdiqlangan/kutilmoqda'ni client-side sanaydi", () => {
    const appts: Appointment[] = [
      appt('1', 'confirmed'),
      appt('2', 'confirmed'),
      appt('3', 'scheduled'),
      appt('4', 'completed'),
      appt('5', 'cancelled'),
    ];
    renderApp(<DayStatsCard appts={appts} />);
    expect(value('day-stat-total')).toBe('5');
    expect(value('day-stat-confirmed')).toBe('2');
    expect(value('day-stat-pending')).toBe('1');
  });

  it("bo'sh appts → barcha sanoq 0 (undefined ham xavfsiz)", () => {
    renderApp(<DayStatsCard appts={[]} />);
    expect(value('day-stat-total')).toBe('0');
    expect(value('day-stat-confirmed')).toBe('0');
    expect(value('day-stat-pending')).toBe('0');
  });

  it('appts berilmasa (undefined) crash qilmaydi, 0 ko’rsatadi', () => {
    renderApp(<DayStatsCard />);
    expect(value('day-stat-total')).toBe('0');
  });

  it("\"Bo'sh slot\" tile olib tashlangan — FreeSlotsCard xuddi shu rail'da real ma'lumot bilan uni almashtiradi (CLI-374)", () => {
    renderApp(<DayStatsCard appts={[appt('1', 'confirmed')]} />);
    expect(screen.queryByTestId('day-stat-free')).not.toBeInTheDocument();
  });
});
