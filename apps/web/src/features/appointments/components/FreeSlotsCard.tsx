import { Button } from '@dental/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBranchAvailability } from '../appointments.api';
import { localTimeLabel } from '../appointments.mappers';

const cardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-sm)',
};

const emptyBoxStyle: React.CSSProperties = {
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
  textAlign: 'center',
};

/**
 * "Bo'sh vaqtlar" — right-rail free-slot kartasi (DS4 §6.3, G17 rail).
 *
 * DS12 regen `GET /schedule/availability/branch` (`schedule.view`) orqali jonli
 * ma'lumot: tanlangan kun + filialdagi BARCHA doktorlarning bo'sh oynalari. Slot
 * boshlanish vaqtlari (HH:MM, Asia/Tashkent) doktorlar bo'yicha dedupe qilinadi.
 *
 * Permission gating chaqiruvchida (`hasPermission('schedule.view')`) — bu komponent
 * faqat `enabled` bo'lganda render qilinadi; hook ham `enabled`'ga rioya qiladi
 * (cheklangan rollarda 403 oldini olish — CLI-153 darsi).
 */
export function FreeSlotsCard({
  branchId,
  date,
  enabled,
}: {
  branchId: string | null;
  /** Tanlangan kun (YYYY-MM-DD, local). */
  date: string;
  /** Chaqiruvchi `schedule.view` ruxsatiga egami. */
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isFetching } = useBranchAvailability({
    branchId,
    date,
    enabled,
  });

  // Doktorlar bo'yicha bo'sh slot boshlanishlarini birlashtirib, daqiqa bo'yicha
  // dedupe + tartib (bir vaqtda bir nechta doktor bo'sh bo'lishi mumkin).
  const slotLabels = useMemo(() => {
    const byMinute = new Map<number, string>();
    for (const doctor of data?.doctors ?? []) {
      for (const slot of doctor.slots) {
        if (!byMinute.has(slot.startMinute)) {
          byMinute.set(slot.startMinute, localTimeLabel(slot.start));
        }
      }
    }
    return [...byMinute.entries()].sort((a, b) => a[0] - b[0]).map(([, label]) => label);
  }, [data]);

  const renderBody = () => {
    if (branchId == null) {
      return (
        <div data-testid="free-slots-empty" style={emptyBoxStyle}>
          {t('appointments.filter_branch')}
        </div>
      );
    }
    if (isLoading) {
      return (
        <div data-testid="free-slots-loading" style={emptyBoxStyle}>
          {t('common.loading')}
        </div>
      );
    }
    if (isError) {
      return (
        <div style={{ ...emptyBoxStyle, flexDirection: 'column', gap: 10 }}>
          <span>{t('states.error_title')}</span>
          <Button variant="default" onClick={() => refetch()}>
            {t('states.retry')}
          </Button>
        </div>
      );
    }
    if (slotLabels.length === 0) {
      return (
        <div data-testid="free-slots-empty" style={emptyBoxStyle}>
          {t('appointments.no_slots')}
        </div>
      );
    }
    return (
      <div data-testid="free-slots-list" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {slotLabels.map((label) => (
          <span
            key={label}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--ink)',
              padding: '4px 8px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          >
            {label}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--ink)',
          }}
        >
          {t('appointments.free_slots')}
        </span>
        {!isLoading && !isError && branchId != null && slotLabels.length > 0 && (
          <span
            data-testid="free-slots-count"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--ink-3)',
              opacity: isFetching ? 0.5 : 1,
            }}
          >
            {slotLabels.length}
          </span>
        )}
      </div>
      {renderBody()}
    </div>
  );
}
