import { useTranslation } from 'react-i18next';
import type { Appointment } from '../appointments.types';

/**
 * "Kutish ro'yxati" — karta chrome + bo'sh-holat (DS4 §6.3, G17 rail).
 *
 * Live data / endpoint / "Slotga joylashtirish" amali JO'NATILMAYDI — bu
 * ham data-gap, ham yangi feature (ds12 / Qaror #33). Foydasiz (non-functional)
 * tugma chiqarilmaydi; faqat bo'sh-holat ko'rsatiladi.
 *
 * `appts` prop DS4-3 montajidan keladi (statistika/kelajak uchun) — tiplangan,
 * lekin hozircha render mantiqida ishlatilmaydi (data manbai yo'q).
 */
export function WaitlistCard(_props: { appts?: Appointment[] }) {
  const { t } = useTranslation();
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
        {t('appointments.waitlist.title')}
      </span>
      <div
        data-testid="waitlist-empty"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 12px',
          background: 'var(--surface-2)',
          border: '1px dashed var(--border)',
          borderRadius: 10,
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          color: 'var(--ink-3)',
        }}
      >
        {t('appointments.waitlist.empty')}
      </div>
    </div>
  );
}
