import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { ActivePlanCard } from './ActivePlanCard';
import { AnamnesisCard } from './AnamnesisCard';
import { BalanceBlock, NextVisitBlock, OpenDiagnosesBlock } from './AsideBlocks';
import classes from './Overview.module.css';
import { RecentVisits } from './RecentVisits';
import { Block, ForbiddenState } from './shared';

/**
 * «Umumiy» bo'limi (UI-D2): ogohlantirish (sarlavhada) → anamnez → faol reja va bugungi bosqich →
 * so'nggi vizitlar · yonda balans, keyingi tashrif, ochiq tashxislar.
 * Klinik bloklar `medical_record.view` talab qiladi: yo'q bo'lsa so'rov yuborilmaydi va
 * `forbidden` holati ko'rsatiladi (default/bo'sh ma'lumot emas).
 */
export function PatientOverview({
  patientId,
  onOpenPlan,
  onUpdateAnamnesis,
}: {
  patientId: string;
  onOpenPlan: () => void;
  onUpdateAnamnesis: () => void;
}) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canClinical = hasPermission('medical_record.view');

  return (
    <div className={classes.layout}>
      <div className={classes.main}>
        {canClinical ? (
          <>
            <AnamnesisCard
              patientId={patientId}
              canEdit={hasPermission('medical_record.edit')}
              onUpdate={onUpdateAnamnesis}
            />
            <ActivePlanCard patientId={patientId} onOpenPlan={onOpenPlan} />
            <RecentVisits patientId={patientId} />
          </>
        ) : (
          <Block titleId="pc-clinical-h" title={t('patientCard.clinical_title')}>
            <ForbiddenState />
          </Block>
        )}
      </div>
      <aside className={classes.aside}>
        {hasPermission('patient.view') && <BalanceBlock patientId={patientId} />}
        {hasPermission('appointment.view') && <NextVisitBlock patientId={patientId} />}
        {canClinical && <OpenDiagnosesBlock patientId={patientId} />}
      </aside>
    </div>
  );
}
