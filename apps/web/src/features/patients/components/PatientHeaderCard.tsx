import type { AllergyEntry } from '@dental/api-client';
import { AlertBanner, Button, Mono } from '@dental/ui';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '@/lib/format';
import type { PatientDetail } from '../patients.types';

type HeaderPatient = Pick<
  PatientDetail,
  'fullName' | 'phone' | 'age' | 'genderLabel' | 'tags' | 'source'
>;

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  const second = parts[1];
  if (!second) return first.slice(0, 2).toUpperCase();
  return ((first[0] ?? '') + (second[0] ?? '')).toUpperCase();
}

export interface PatientHeaderCardProps {
  patient: HeaderPatient;
  /** Bemor balansi (qarz > 0). undefined bo'lsa balans bloki ko'rsatilmaydi. */
  balance?: number;
  /** Barcha allergiyalar (UI-D2: sarlavhada doimiy, 2-daraja banner). Bo'sh/undefined bo'lsa banner yo'q. */
  allergies?: Pick<AllergyEntry, 'substance' | 'severity'>[] | undefined;
  /** "To'lov qabul qilish" tugmasi — mavjud xulq (faqat ko'rinish + ixtiyoriy navigatsiya). */
  onCollectPayment?: () => void;
}

export function PatientHeaderCard({
  patient,
  balance,
  allergies,
  onCollectPayment,
}: PatientHeaderCardProps) {
  const { t } = useTranslation();

  const ageGender = [
    patient.age != null ? String(patient.age) : null,
    patient.genderLabel ? patient.genderLabel : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const metaSegments = [
    ageGender || null,
    patient.phone ? <Mono key="phone">{patient.phone}</Mono> : null,
    patient.source ? `${t('patients.form.source')}: ${patient.source}` : null,
  ].filter((s): s is NonNullable<typeof s> => Boolean(s));

  const tag = patient.tags?.[0];
  const isDebt = balance != null && balance > 0;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 18,
          padding: '20px 22px',
        }}
      >
        <div
          aria-hidden
          style={{
            alignItems: 'center',
            background: 'var(--teal-50)',
            borderRadius: 99,
            color: 'var(--teal-700)',
            display: 'flex',
            flex: '0 0 auto',
            fontSize: 20,
            fontWeight: 700,
            height: 56,
            justifyContent: 'center',
            width: 56,
          }}
        >
          {initials(patient.fullName)}
        </div>

        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <h1
              style={{
                color: 'var(--ink)',
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '-.02em',
                margin: 0,
              }}
            >
              {patient.fullName}
            </h1>
            {tag && (
              <span
                style={{
                  background: 'var(--primary-soft)',
                  borderRadius: 99,
                  color: 'var(--primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '3px 10px',
                }}
              >
                {tag}
              </span>
            )}
          </div>

          {metaSegments.length > 0 && (
            <div
              style={{
                alignItems: 'center',
                color: 'var(--text-2)',
                display: 'flex',
                flexWrap: 'wrap',
                fontSize: 'var(--text-base)',
                gap: 8,
                marginTop: 7,
              }}
            >
              {metaSegments.map((seg, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static meta order
                <span key={i} style={{ alignItems: 'center', display: 'inline-flex', gap: 8 }}>
                  {i > 0 && <span style={{ color: 'var(--border-strong)' }}>|</span>}
                  {seg}
                </span>
              ))}
            </div>
          )}
        </div>

        {balance != null && (
          <div
            style={{
              display: 'flex',
              flex: '0 0 auto',
              flexDirection: 'column',
              gap: 8,
              marginLeft: 'auto',
            }}
          >
            <div>
              <div
                style={{
                  color: 'var(--text-2)',
                  fontSize: 13,
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                }}
              >
                {t('patients.balance')}
              </div>
              <div
                style={{
                  color: isDebt ? 'var(--danger)' : 'var(--ink)',
                  fontSize: 21,
                  fontWeight: 600,
                }}
              >
                <Mono>{formatCurrency(Math.abs(balance), t)}</Mono>
              </div>
            </div>
            {onCollectPayment && (
              <Button variant="primary" onClick={onCollectPayment}>
                {t('patients.collect_payment')}
              </Button>
            )}
          </div>
        )}
      </div>

      {allergies && allergies.length > 0 && (
        <div style={{ padding: '0 22px 16px' }}>
          <AlertBanner tier={2} title={t('patientCard.allergy_title')}>
            {allergies.map((a, i) => (
              <span key={a.substance}>
                {i > 0 && <span aria-hidden> · </span>}
                {a.severity === 'severe' ? <strong>{a.substance}</strong> : a.substance}
              </span>
            ))}
            <span> — {t('patientCard.allergy_hint')}</span>
          </AlertBanner>
        </div>
      )}
    </div>
  );
}
