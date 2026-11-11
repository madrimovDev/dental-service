import { Button, StatusPill } from '@dental/ui';
import { Box } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { DoctorNextPatient } from '../../doctor.api.ts';

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' });

export const ageFrom = (dob: string | null, now = new Date()): number | null => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  let a = now.getFullYear() - d.getFullYear();
  if (
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())
  ) {
    a -= 1;
  }
  return a >= 0 ? a : null;
};

function Block({
  label,
  tone,
  children,
}: {
  label: string;
  tone: 'danger' | 'ok' | 'neutral';
  children: ReactNode;
}) {
  const bg = {
    danger: 'var(--danger-soft)',
    ok: 'var(--primary-soft)',
    neutral: 'var(--surface-2)',
  };
  return (
    <Box
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        background: bg[tone],
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          color: tone === 'danger' ? 'var(--danger)' : 'var(--ink-3)',
        }}
      >
        {label}
      </span>
      {children}
    </Box>
  );
}

/** Keyingi bemor kartochkasi (UI-D1): holat, allergiya, lab, oxirgi vizit + bitta asosiy tugma. */
export function NextPatientCard({
  next,
  canCall,
  calling,
  onCall,
}: {
  next: DoctorNextPatient;
  canCall: boolean;
  calling?: boolean;
  onCall: () => void;
}) {
  const { t } = useTranslation();
  const age = ageFrom(next.dateOfBirth);
  const waiting = next.waitingMinutes != null;
  return (
    <Box
      component="section"
      aria-label={t('doctorDay.next_patient', 'Keyingi bemor')}
      style={{
        border: '2px solid var(--primary)',
        borderRadius: 14,
        background: 'var(--surface)',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <Box style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px' }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '.05em',
            textTransform: 'uppercase',
            color: 'var(--primary)',
          }}
        >
          {t('doctorDay.next_patient', 'Keyingi bemor')} · {fmtTime(next.startTime)}
        </span>
        <StatusPill status={waiting ? 'waiting' : 'planned'} dot>
          {waiting
            ? t('doctorDay.status_waiting', { count: next.waitingMinutes ?? 0 })
            : t('doctorDay.status_planned')}
        </StatusPill>
      </Box>
      <Box style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '12px 20px' }}>
        <Box style={{ display: 'flex', flexDirection: 'column', marginRight: 'auto' }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>{next.patientName}</h2>
          {age != null && (
            <span style={{ fontSize: 15, color: 'var(--ink-2)' }}>
              {t('doctorDay.age', { count: age })}
            </span>
          )}
        </Box>
        <Link to={`/patients/${next.patientId}`} style={{ textDecoration: 'none' }}>
          <Button size="lg">{t('doctorDay.open_card', 'Kartani ochish')}</Button>
        </Link>
        {canCall && next.queueTicketId && (
          <Button variant="primary" size="lg" disabled={calling} onClick={onCall}>
            {t('doctorDay.call_to_chair')}
          </Button>
        )}
      </Box>
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 10,
        }}
      >
        {next.allergies.length > 0 && (
          <Block label={t('doctorDay.attention')} tone="danger">
            <b>{next.allergies.map((a) => a.substance).join(', ')}</b>
            <span style={{ fontSize: 13 }}>{t('doctorDay.allergy_hint')}</span>
          </Block>
        )}
        {next.lab && (
          <Block label={t('doctorDay.lab')} tone="ok">
            <b>
              {t(`doctorDay.lab_status.${next.lab.status}`, next.lab.status)} ·{' '}
              {fmtDay(next.lab.at)}
            </b>
            <span style={{ fontSize: 13 }}>
              {[next.lab.labName, next.lab.detail].filter(Boolean).join(' · ')}
            </span>
          </Block>
        )}
        <Block label={t('doctorDay.last_visit')} tone="neutral">
          {next.lastVisit ? (
            <>
              <b>{fmtDay(next.lastVisit.date)}</b>
              {next.lastVisit.summary && (
                <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                  «{next.lastVisit.summary}»
                </span>
              )}
            </>
          ) : (
            <b>{t('doctorDay.first_visit')}</b>
          )}
        </Block>
      </Box>
    </Box>
  );
}
