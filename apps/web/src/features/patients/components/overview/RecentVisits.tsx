import type { Diagnosis, VisitNote } from '@dental/api-client';
import { StateView } from '@dental/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDiagnoses, useVisitNotes } from '@/features/clinical/clinical.api';
import classes from './Overview.module.css';
import { Block, ForbiddenState, isForbiddenError } from './shared';

const LIMIT = 3;

const p2 = (n: number) => String(n).padStart(2, '0');
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}`;
};

export function latestVisits(notes: VisitNote[], limit = LIMIT): VisitNote[] {
  return [...notes].sort((a, b) => b.visitDate.localeCompare(a.visitDate)).slice(0, limit);
}

export function RecentVisits({ patientId }: { patientId: string }) {
  const { t, i18n } = useTranslation();
  const notesQuery = useVisitNotes(patientId);
  const diagnosesQuery = useDiagnoses();
  const lang = i18n.language?.startsWith('ru') ? 'ru' : 'uz';

  const diagnosisMap = useMemo(() => {
    const map = new Map<string, Diagnosis>();
    for (const d of diagnosesQuery.data ?? []) map.set(d.id, d);
    return map;
  }, [diagnosesQuery.data]);

  const title = t('patientCard.visits.title');
  if (isForbiddenError(notesQuery.error)) {
    return (
      <Block titleId="pc-visits-h" title={title}>
        <ForbiddenState />
      </Block>
    );
  }
  if (notesQuery.isError) {
    return (
      <Block titleId="pc-visits-h" title={title}>
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => notesQuery.refetch()}
        />
      </Block>
    );
  }
  if (notesQuery.isLoading) return null;

  const visits = latestVisits(notesQuery.data ?? []);

  return (
    <Block titleId="pc-visits-h" title={title}>
      {visits.length === 0 ? (
        <span className={classes.muted}>{t('patientCard.visits.empty')}</span>
      ) : (
        <div>
          {visits.map((v) => {
            const first = (v.assessmentDiagnoses ?? [])[0];
            const dx = first ? diagnosisMap.get(first) : undefined;
            const heading = dx
              ? lang === 'ru'
                ? dx.nameRu
                : dx.nameUz
              : (v.performedServices?.length ?? 0) > 0
                ? t('patientCard.visits.services', { count: v.performedServices?.length })
                : t('patientCard.visits.visit');
            const text = v.subjective || v.objective || v.plan || v.freeNotes || '';
            return (
              <div key={v.id} className={classes.visit}>
                <span className={classes.visitDate}>{shortDate(v.visitDate)}</span>
                <div className={classes.visitBody}>
                  <b style={{ fontWeight: 600 }}>{heading}</b>
                  {text && <span className={classes.muted}>{text}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Block>
  );
}
