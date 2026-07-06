import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../../test-utils';
import { QueueCard, type QueueRow, QueueTicketStatus, queueStatusTone } from './QueueCard';

const VALID_TONES = ['neutral', 'success', 'warning', 'danger', 'info', 'accent'] as const;

const rows: QueueRow[] = [
  {
    id: 'q1',
    number: '12',
    patient: 'Ali Valiyev',
    meta: 'Dr. Karimov',
    status: 'waiting',
    statusLabel: 'Kutmoqda',
  },
  {
    id: 'q2',
    number: '13',
    patient: 'Hasan Toshev',
    status: 'in_progress',
    statusLabel: 'Qabulda',
  },
];

describe('QueueCard', () => {
  it('renders rows from props (number, patient, status chip text)', () => {
    renderApp(<QueueCard title="Navbat holati" rows={rows} waitingLabel="3 kutmoqda" />);
    expect(screen.getByText('Navbat holati')).toBeInTheDocument();
    expect(screen.getByText('3 kutmoqda')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Ali Valiyev')).toBeInTheDocument();
    expect(screen.getByText('Dr. Karimov')).toBeInTheDocument();
    expect(screen.getByText('Kutmoqda')).toBeInTheDocument();
    expect(screen.getByText('Qabulda')).toBeInTheDocument();
  });

  it('does not crash on empty rows', () => {
    renderApp(<QueueCard title="Navbat holati" rows={[]} emptyText="Navbat bo'sh" />);
    expect(screen.getByText("Navbat bo'sh")).toBeInTheDocument();
  });

  it('does not crash on empty rows without waitingLabel or emptyText', () => {
    renderApp(<QueueCard title="Navbat holati" rows={[]} />);
    expect(screen.getByText('Navbat holati')).toBeInTheDocument();
  });

  it('maps every QueueTicketStatus enum value to a valid non-empty tone', () => {
    for (const status of Object.values(QueueTicketStatus)) {
      const tone = queueStatusTone(status);
      expect(tone).toBeTruthy();
      expect(VALID_TONES).toContain(tone);
    }
  });

  it('falls back to neutral for an unknown status string (no blank chip)', () => {
    expect(queueStatusTone('totally_unknown')).toBe('neutral');
  });
});
