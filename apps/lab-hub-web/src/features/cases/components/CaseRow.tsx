import { StatusPill } from '@dental/ui';
import { useTranslation } from 'react-i18next';
import { STATUS_MEANING, workTitle } from '../cases.mappers';
import type { CaseDto } from '../cases.types';
import { DueChip } from './DueChip';

export function CaseRow({
  c,
  selected,
  techName,
  onSelect,
}: {
  c: CaseDto;
  selected: boolean;
  techName?: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const meta = [
    c.shade ? t('labHub.cases.meta.shade', { shade: c.shade }) : null,
    c.status === 'remake' ? t('labHub.cases.meta.remake') : null,
    c.purgedAt ? t('labHub.cases.meta.purged') : null,
    techName ? t('labHub.cases.meta.tech', { name: techName }) : t('labHub.cases.meta.unassigned'),
  ].filter(Boolean);
  return (
    <button type="button" className="row" aria-pressed={selected} onClick={onSelect}>
      <span className="row__main">
        <span className="row__top">
          <b>{workTitle(c)}</b>
          {c.clinicCode && <span className="row__code">{c.clinicCode}</span>}
        </span>
        <span className="row__clinic">
          {[c.clinicName, c.doctorName].filter(Boolean).join(' · ')}
        </span>
        <span className="row__meta">{meta.join(' · ')}</span>
      </span>
      <span className="row__side">
        <DueChip due={c.dueDate} />
        <StatusPill status={STATUS_MEANING[c.status]}>{t(`labHub.status.${c.status}`)}</StatusPill>
      </span>
    </button>
  );
}
