import { Button } from '@dental/ui';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useConfirmMedicalRecord, useMedicalRecord } from '../../patients.api';
import classes from './Overview.module.css';
import { formatDate } from './shared';

/** Tasdiq shu kundan eskirsa "bugun so'rang" ogohlantirishi chiqadi. */
export const ANAMNESIS_STALE_DAYS = 90;

export function daysSince(iso: string, now = Date.now()): number {
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

export function AnamnesisCard({
  patientId,
  canEdit,
  onUpdate,
}: {
  patientId: string;
  canEdit: boolean;
  onUpdate: () => void;
}) {
  const { t } = useTranslation();
  const { data: record } = useMedicalRecord(patientId);
  const confirmMut = useConfirmMedicalRecord(patientId);

  if (!record) return null;

  const confirmedAt = record.confirmedAt ?? null;
  const stale = confirmedAt == null || daysSince(confirmedAt) >= ANAMNESIS_STALE_DAYS;

  return (
    <section aria-labelledby="pc-anamnesis-h" className={`${classes.block} ${classes.blockRow}`}>
      <div className={classes.grow}>
        <h2 id="pc-anamnesis-h" className={classes.title}>
          {t('patientCard.anamnesis.title')}
        </h2>
        {confirmedAt == null ? (
          <span className={classes.warn}>{t('patientCard.anamnesis.never')}</span>
        ) : stale ? (
          <span className={classes.warn}>
            {t('patientCard.anamnesis.stale', { date: formatDate(confirmedAt) })}
          </span>
        ) : (
          <span className={classes.muted}>
            {t('patientCard.anamnesis.confirmed_on', { date: formatDate(confirmedAt) })}
          </span>
        )}
      </div>
      {canEdit && (
        <>
          <Button variant="default" onClick={onUpdate}>
            {t('patientCard.anamnesis.update')}
          </Button>
          <Button
            variant="primary"
            disabled={confirmMut.isPending}
            onClick={() =>
              confirmMut.mutate(undefined, {
                onSuccess: () =>
                  notifications.show({ message: t('patientCard.anamnesis.confirmed_toast') }),
              })
            }
          >
            {t('patientCard.anamnesis.confirm')}
          </Button>
        </>
      )}
    </section>
  );
}
