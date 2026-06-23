import { useTranslation } from 'react-i18next';
import type { Appointment } from '../appointments.types';

/**
 * "Bugungi kun" — bespoke 2×2 tile grid (DS4 §6.3, G17 rail).
 * Locked `StatCard` primitivi ISHLATILMAYDI — uning bir qatorli layout'i 2×2'ga mos emas.
 *
 * Jami / Tasdiqlangan / Kutilmoqda — uzatilgan `appts`'dan client-side hisoblanadi
 * (`appts ?? []` xavfsiz — bo'sh → 0; CalendarScreen.test `useAppointments`'ni `{data:[]}` mock qiladi).
 * "Bo'sh slot" → `—` (data manbai yo'q — ds12 data-gap; backend chaqiruvi qo'shilmaydi).
 */
type Tile = { key: string; labelKey: string; value: string };

function Stat({ tileKey, labelKey, value }: { tileKey: string; labelKey: string; value: string }) {
  const { t } = useTranslation();
  return (
    <div
      data-testid={`day-stat-${tileKey}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 12,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 22,
          fontWeight: 700,
          lineHeight: 1.1,
          color: 'var(--ink)',
        }}
      >
        {value}
      </span>
      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-3)' }}>
        {t(labelKey)}
      </span>
    </div>
  );
}

export function DayStatsCard({ appts }: { appts?: Appointment[] }) {
  const { t } = useTranslation();
  const list = appts ?? [];
  const total = list.length;
  const confirmed = list.filter((a) => a.status === 'confirmed').length;
  const pending = list.filter((a) => a.status === 'scheduled').length;

  const tiles: Tile[] = [
    { key: 'total', labelKey: 'dashboard.today_total', value: String(total) },
    { key: 'confirmed', labelKey: 'appointments.status.confirmed', value: String(confirmed) },
    { key: 'pending', labelKey: 'appointments.status.scheduled', value: String(pending) },
    // "Bo'sh slot" — data manbai yo'q (ds12 data-gap) → placeholder.
    { key: 'free', labelKey: 'appointments.free_slots', value: '—' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 16,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--ink)',
        }}
      >
        {t('appointments.today')}
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {tiles.map((tile) => (
          <Stat key={tile.key} tileKey={tile.key} labelKey={tile.labelKey} value={tile.value} />
        ))}
      </div>
    </div>
  );
}
