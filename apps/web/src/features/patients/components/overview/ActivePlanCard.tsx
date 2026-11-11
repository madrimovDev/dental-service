import type { TreatmentPlanWithStages, TreatmentStage } from '@dental/api-client';
import { Button, Mono, StatusPill } from '@dental/ui';
import { useTranslation } from 'react-i18next';
import { useTreatmentPlans } from '@/features/clinical/clinical.api';
import { formatCurrency } from '@/lib/format';
import classes from './Overview.module.css';
import { Block, ForbiddenState, isForbiddenError } from './shared';

const ACTIVE_ORDER = ['in_progress', 'accepted', 'presented', 'draft'] as const;

/** Faol reja: avval jarayondagi, so'ng qabul qilingan/taklif qilingan/qoralama (eng yangisi). */
export function pickActivePlan(plans: TreatmentPlanWithStages[]): TreatmentPlanWithStages | null {
  for (const status of ACTIVE_ORDER) {
    const found = plans
      .filter((p) => p.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (found) return found;
  }
  return null;
}

/** Bugungi bosqich: jarayondagi, bo'lmasa navbatdagi (hali bajarilmagan) bosqich. */
export function pickTodayStage(stages: TreatmentStage[]): TreatmentStage | null {
  const sorted = [...stages].sort((a, b) => a.sequence - b.sequence);
  return (
    sorted.find((s) => s.status === 'in_progress') ??
    sorted.find((s) => s.status === 'pending') ??
    null
  );
}

export function ActivePlanCard({
  patientId,
  onOpenPlan,
}: {
  patientId: string;
  onOpenPlan: () => void;
}) {
  const { t } = useTranslation();
  const plansQuery = useTreatmentPlans(patientId);

  if (isForbiddenError(plansQuery.error)) {
    return (
      <Block titleId="pc-plan-h" title={t('patientCard.plan.title_empty')}>
        <ForbiddenState />
      </Block>
    );
  }
  if (plansQuery.isLoading) return null;

  const plan = pickActivePlan(plansQuery.data ?? []);
  if (!plan) {
    return (
      <Block titleId="pc-plan-h" title={t('patientCard.plan.title_empty')}>
        <span className={classes.muted}>{t('patientCard.plan.none')}</span>
      </Block>
    );
  }

  const stages = plan.stages ?? [];
  const done = stages.filter((s) => s.status === 'completed').length;
  const today = pickTodayStage(stages);
  const percent = stages.length > 0 ? Math.round((done / stages.length) * 100) : 0;

  return (
    <Block titleId="pc-plan-h" title={t('patientCard.plan.title', { title: plan.title })}>
      <div className={classes.row}>
        <StatusPill status={plan.status === 'in_progress' ? 'active' : 'planned'}>
          {t(`treatment_plan.status_${plan.status}`)}
        </StatusPill>
        <span className={classes.grow} />
        <Button variant="default" onClick={onOpenPlan}>
          {t('patientCard.plan.open')}
        </Button>
      </div>
      <div
        className={classes.progress}
        role="img"
        aria-label={t('patientCard.plan.progress', { done, total: stages.length })}
      >
        <div className={classes.progressFill} style={{ width: `${percent}%` }} />
      </div>
      {today ? (
        <>
          <div className={classes.today}>
            <div className={classes.grow}>
              <span className={classes.todayLabel}>
                {t('patientCard.plan.today_stage', { n: today.sequence, total: stages.length })}
              </span>
              <b style={{ fontSize: 16 }}>{today.serviceName}</b>
              <span className={classes.muted}>
                {today.toothNumbers && today.toothNumbers.length > 0 && (
                  <>
                    {t('patientCard.plan.teeth')}: <Mono>{today.toothNumbers.join(', ')}</Mono> ·{' '}
                  </>
                )}
                <Mono>{formatCurrency(Number(today.cost), t)}</Mono>
              </span>
            </div>
          </div>
          <span className={classes.note}>{t('patientCard.plan.effects')}</span>
        </>
      ) : (
        <span className={classes.muted}>{t('patientCard.plan.all_done')}</span>
      )}
    </Block>
  );
}
