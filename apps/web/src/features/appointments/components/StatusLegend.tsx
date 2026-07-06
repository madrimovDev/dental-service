import { useTranslation } from 'react-i18next';
import type { AppointmentStatus } from '../appointments.types';
import { StatusIndicator } from './StatusIndicator';

/**
 * Legend strip — 4 status dot/check element (DS4 §6.3, G15).
 * Indikatorlar bloklar bilan bir manbadan keladi (`StatusIndicator`, DS4-1) →
 * vizual drift yo'q. Dizaynning trailing "surib ko'chiring · bosib qo'shing"
 * drag-maslahati QASDDAN OLIB TASHLANGAN (mavjud bo'lmagan interaksiya, Qaror #33 / ds12).
 */
const LEGEND_STATUSES: AppointmentStatus[] = ['confirmed', 'scheduled', 'in_progress', 'completed'];

export function StatusLegend() {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 18,
        padding: '8px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {LEGEND_STATUSES.map((status) => (
        <span
          key={status}
          data-testid={`legend-item-${status}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontFamily: 'var(--font-sans)',
            fontSize: 12,
            color: 'var(--ink-2)',
          }}
        >
          <StatusIndicator status={status} />
          {t(`appointments.status.${status}`)}
        </span>
      ))}
    </div>
  );
}
