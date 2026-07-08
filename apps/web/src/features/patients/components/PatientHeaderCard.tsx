import type { AllergyEntry } from '@dental/api-client';
import { Button, Mono } from '@dental/ui';
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
  /** Faqat anestetik severe allergiya — render sharti PatientCard'da hisoblanadi. */
  severeAllergy?: Pick<AllergyEntry, 'substance' | 'severity'> | undefined;
  /** "To'lov qabul qilish" tugmasi — mavjud xulq (faqat ko'rinish + ixtiyoriy navigatsiya). */
  onCollectPayment?: () => void;
}

export function PatientHeaderCard({
  patient,
  balance,
  severeAllergy,
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
        {/* Bespoke gradient avatar — Avatar primitivi gradient bermaydi (spec §4.1). */}
        <div
          aria-hidden
          style={{
            alignItems: 'center',
            background: 'linear-gradient(135deg, var(--primary), var(--violet))',
            borderRadius: 16,
            color: 'var(--on-primary)',
            display: 'flex',
            flex: '0 0 auto',
            fontSize: 21,
            fontWeight: 700,
            height: 60,
            justifyContent: 'center',
            width: 60,
          }}
        >
          {initials(patient.fullName)}
        </div>

        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <h1
              style={{
                color: 'var(--ink)',
                fontSize: 22,
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
                color: 'var(--ink-3)',
                display: 'flex',
                flexWrap: 'wrap',
                fontSize: 12.5,
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
                  color: 'var(--ink-3)',
                  fontSize: 11,
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

      {severeAllergy && (
        <div
          style={{
            alignItems: 'center',
            background: 'var(--danger-soft)',
            borderTop: '1px solid color-mix(in srgb, var(--danger) 22%, transparent)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            padding: '12px 22px',
          }}
        >
          <span
            aria-hidden
            style={{
              alignItems: 'center',
              background: 'var(--danger)',
              borderRadius: 8,
              color: 'var(--text-on-danger)',
              display: 'flex',
              flex: '0 0 auto',
              fontSize: 18,
              fontWeight: 700,
              height: 30,
              justifyContent: 'center',
              width: 30,
            }}
          >
            !
          </span>
          <span style={{ color: 'var(--ink)', fontSize: 13 }}>
            <strong style={{ color: 'var(--danger)' }}>
              {t('patients.severe_allergy_warning')}
            </strong>{' '}
            {severeAllergy.substance}
          </span>
          <span
            style={{
              background: 'var(--danger)',
              borderRadius: 99,
              color: 'var(--text-on-danger)',
              fontSize: 12,
              fontWeight: 600,
              marginLeft: 'auto',
              padding: '3px 10px',
            }}
          >
            {t('patients.allergy_confirm_pill')}
          </span>
        </div>
      )}
    </div>
  );
}
