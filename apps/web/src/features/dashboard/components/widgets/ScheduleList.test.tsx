import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../../test-utils';
import {
  AppointmentStatus,
  appointmentStatusTone,
  ScheduleList,
  type ScheduleRow,
} from './ScheduleList';

const VALID_TONES = ['neutral', 'success', 'warning', 'danger', 'info', 'accent'] as const;

const rows: ScheduleRow[] = [
  {
    id: 'a1',
    time: '09:30',
    patient: 'Ali Valiyev',
    meta: 'Plomba · Dr. Karimov',
    duration: '30 min',
    status: 'scheduled',
    statusLabel: 'Rejalashtirilgan',
  },
  {
    id: 'a2',
    time: '10:15',
    patient: 'Hasan Toshev',
    status: 'in_progress',
    statusLabel: 'Jarayonda',
  },
];

describe('ScheduleList', () => {
  it('renders rows from props (time, patient, status chip text)', () => {
    renderApp(<ScheduleList title="Bugungi jadval" rows={rows} />);
    expect(screen.getByText('Bugungi jadval')).toBeInTheDocument();
    expect(screen.getByText('09:30')).toBeInTheDocument();
    expect(screen.getByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText('Plomba · Dr. Karimov')).toBeInTheDocument();
    expect(screen.getByText('Rejalashtirilgan')).toBeInTheDocument();
    expect(screen.getByText('Jarayonda')).toBeInTheDocument();
  });

  it('renders the calendar link button when label given', () => {
    renderApp(<ScheduleList title="Bugungi jadval" rows={rows} calendarLabel="Kalendar" />);
    expect(screen.getByText('Kalendar ›')).toBeInTheDocument();
  });

  it('does not crash on empty rows', () => {
    renderApp(<ScheduleList title="Bugungi jadval" rows={[]} emptyText="Bugun yozilish yo'q" />);
    expect(screen.getByText("Bugun yozilish yo'q")).toBeInTheDocument();
  });

  it('does not crash on empty rows without emptyText', () => {
    renderApp(<ScheduleList title="Bugungi jadval" rows={[]} />);
    expect(screen.getByText('Bugungi jadval')).toBeInTheDocument();
  });

  it('maps every AppointmentStatus enum value to a valid non-empty tone', () => {
    for (const status of Object.values(AppointmentStatus)) {
      const tone = appointmentStatusTone(status);
      expect(tone).toBeTruthy();
      expect(VALID_TONES).toContain(tone);
    }
  });

  it('falls back to neutral for an unknown status string (no blank chip)', () => {
    expect(appointmentStatusTone('totally_unknown')).toBe('neutral');
  });
});
