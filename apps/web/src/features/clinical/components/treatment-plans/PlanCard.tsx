import type {
  SignTreatmentPlanConsentBody,
  TreatmentPlanStatus,
  TreatmentPlanWithStages,
  TreatmentStageAcceptance,
  TreatmentStageStatus,
} from '@dental/api-client';
import { Mono, StatusPill } from '@dental/ui';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBan,
  IconCheck,
  IconCircleCheck,
  IconFileText,
  IconPlayerPlay,
  IconReceipt2,
  IconWritingSign,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toPlanCardVM } from '../../clinical.mappers';
import { EstimateView } from './EstimateView';
import { StageRow } from './StageRow';
import classes from './TreatmentPlansTab.module.css';

// B4 (CLI-439): `accepted`dan tashqari lifecycle amallari (`in_progress`/`completed`/
// `cancelled`) uchun yangi tugma matnlari kerak edi, lekin bu pass faqat `apps/web/**`
// egaligiga ega — `packages/i18n`ga tegilmaydi. Inline TODO-literal (uz/ru), handoff:
// keyingi pass `treatment_plan.start`/`treatment_plan.complete`/`treatment_plan.cancel_plan`
// i18n kalitlarini qo'shib shu literal'larni almashtirsin. `common.cancel` mavjud kalit —
// bekor qilish tugmasi shuni ishlatadi (yangi kalit shart emas).
const PLAN_ACTION_LABEL: Record<'start' | 'complete', { uz: string; ru: string }> = {
  start: { uz: 'Ijroni boshlash', ru: 'Начать выполнение' },
  complete: { uz: 'Rejani yakunlash', ru: 'Завершить план' },
};

// B4: backend transition jadvaliga mos (`treatment-plans.transitions.ts`, Qaror #25) —
// `cancelled` faqat terminal bo'lmagan statusdan (draft/presented/accepted/in_progress)
// ruxsat etiladi; UI shu jadvalga ORTIQCHA imkoniyat taklif qilmasligi kerak.
const CANCELLABLE_PLAN_STATUSES: readonly TreatmentPlanStatus[] = [
  'draft',
  'presented',
  'accepted',
  'in_progress',
];

export function PlanCard({
  plan,
  canEdit,
  onUpdateStage,
  onSetAcceptance,
  acceptancePending,
  onAcceptAll,
  acceptAllPending,
  onPresentPlan,
  onAcceptPlan,
  onSetPlanStatus,
  planStatusPending,
  onSignConsent,
  consentPending,
}: {
  // CLI-114: stage'lar list javobida (har kartada usePlanDetail YO'Q).
  plan: TreatmentPlanWithStages;
  canEdit: boolean;
  onUpdateStage: (stageId: string, status: TreatmentStageStatus) => void;
  onSetAcceptance: (stageId: string, acceptance: TreatmentStageAcceptance) => void;
  acceptancePending: boolean;
  onAcceptAll: (stageIds: string[]) => void;
  acceptAllPending: boolean;
  onPresentPlan: (planId: string) => void;
  onAcceptPlan: (planId: string) => void;
  // B4: accepted→in_progress/cancelled, in_progress→completed/cancelled va h.k.
  // (present/accept'dan farqli — bularga maxsus xato-xabar kerak emas, default
  // global toast — CLI-165 — yetarli).
  onSetPlanStatus: (planId: string, status: TreatmentPlanStatus) => void;
  planStatusPending: boolean;
  onSignConsent: (planId: string, body: SignTreatmentPlanConsentBody) => void;
  consentPending: boolean;
}) {
  const { t, i18n } = useTranslation();
  const vm = toPlanCardVM(plan);
  const [estimateOpened, estimate] = useDisclosure(false);
  const [consentOpened, consent] = useDisclosure(false);
  const [signatureUrl, setSignatureUrl] = useState('');

  const proposedStageIds = plan.stages.filter((s) => s.acceptance === 'proposed').map((s) => s.id);
  const hasConsent = plan.consentSignedAt != null;
  const lang = i18n.language === 'ru' ? 'ru' : 'uz';
  const canCancelPlan = CANCELLABLE_PLAN_STATUSES.includes(plan.status);

  // Yil — plan.createdAt'dan (vizual sarlavha uchun; yangi data YO'Q).
  const year = plan.createdAt ? new Date(plan.createdAt).getFullYear() : null;

  // Progress — bajarilgan bosqichlar / jami (faqat presentation; backend YO'Q).
  const totalStages = plan.stages.length;
  const completedStages = plan.stages.filter((s) => s.status === 'completed').length;
  const progressPct = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

  const submitConsent = () => {
    onSignConsent(plan.id, signatureUrl ? { consentSignatureUrl: signatureUrl } : {});
    consent.close();
    setSignatureUrl('');
  };

  return (
    <div className={classes.grid}>
      {/* ===== Chap: reja card ===== */}
      <div className={classes.planCard}>
        <div className={classes.planHeader}>
          <div>
            <div className={classes.planTitle}>
              {vm.title}
              {year != null && (
                <>
                  {' · '}
                  <Mono>{year}</Mono>
                </>
              )}
            </div>
            <div className={classes.planSubtitle}>
              {totalStages} {t('treatment_plan.stages')}
            </div>
          </div>
          <Button
            size="compact-xs"
            variant="light"
            leftSection={<IconReceipt2 size={14} />}
            onClick={estimate.open}
          >
            {t('treatment_plan.estimate_open')}
          </Button>
        </div>

        <div className={classes.headChips}>
          <StatusPill status={vm.statusTone}>{t(vm.statusLabelKey)}</StatusPill>
          {hasConsent && (
            <StatusPill status="success">{t('treatment_plan.consent_signed')}</StatusPill>
          )}
        </div>

        {canEdit && (
          <div className={classes.actions}>
            {proposedStageIds.length > 0 && (
              <Button
                size="compact-sm"
                variant="light"
                color="teal"
                leftSection={<IconCheck size={14} />}
                loading={acceptAllPending}
                onClick={() => onAcceptAll(proposedStageIds)}
              >
                {t('treatment_plan.accept_all')}
              </Button>
            )}
            {plan.status === 'draft' && (
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<IconFileText size={14} />}
                loading={planStatusPending}
                onClick={() => onPresentPlan(plan.id)}
              >
                {t('treatment_plan.present')}
              </Button>
            )}
            {!hasConsent && (
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<IconWritingSign size={14} />}
                onClick={consent.open}
              >
                {t('treatment_plan.sign_consent')}
              </Button>
            )}
            {plan.status === 'presented' && (
              <Button
                size="compact-sm"
                color="teal"
                leftSection={<IconCheck size={14} />}
                // Consent gating (proaktiv): tugma rozilik bo'lmasa o'chiq; backend ham 400 qaytaradi.
                disabled={!hasConsent}
                loading={planStatusPending}
                onClick={() => onAcceptPlan(plan.id)}
              >
                {t('treatment_plan.accept_plan')}
              </Button>
            )}
            {/* B4 (CLI-439): accepted→in_progress — avval UI'da yo'q edi, plan "accepted"da
                qotib qolardi. */}
            {plan.status === 'accepted' && (
              <Button
                size="compact-sm"
                variant="default"
                leftSection={<IconPlayerPlay size={14} />}
                loading={planStatusPending}
                onClick={() => onSetPlanStatus(plan.id, 'in_progress')}
              >
                {PLAN_ACTION_LABEL.start[lang]}
              </Button>
            )}
            {/* B4: in_progress→completed. */}
            {plan.status === 'in_progress' && (
              <Button
                size="compact-sm"
                color="teal"
                leftSection={<IconCircleCheck size={14} />}
                loading={planStatusPending}
                onClick={() => onSetPlanStatus(plan.id, 'completed')}
              >
                {PLAN_ACTION_LABEL.complete[lang]}
              </Button>
            )}
            {/* B4: backend transition jadvaliga mos — cancel istalgan terminal
                bo'lmagan statusdan (draft/presented/accepted/in_progress). */}
            {canCancelPlan && (
              <Button
                size="compact-sm"
                variant="subtle"
                color="red"
                leftSection={<IconBan size={14} />}
                loading={planStatusPending}
                onClick={() => onSetPlanStatus(plan.id, 'cancelled')}
              >
                {t('common.cancel')}
              </Button>
            )}
          </div>
        )}

        {totalStages > 0 && (
          <div>
            <div className={classes.tableHead}>
              <span className={classes.colNum}>#</span>
              <span>{t('treatment_plan.stages')}</span>
              <span>{t('treatment_plan.tooth_numbers')}</span>
              <span className={classes.colCost}>{t('treatment_plan.cost')}</span>
              <span className={classes.colStatus}>{t('treatment_plan.status')}</span>
            </div>
            <div className={classes.stageList}>
              {plan.stages.map((stage) => (
                <StageRow
                  key={stage.id}
                  stage={stage}
                  canEdit={canEdit}
                  onUpdateStage={onUpdateStage}
                  onSetAcceptance={onSetAcceptance}
                  acceptancePending={acceptancePending}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== O'ng: moliyaviy xulosa ===== */}
      <aside className={classes.summaryCard}>
        <div className={classes.summaryTitle}>{t('treatment_plan.estimate')}</div>

        <div className={classes.summaryRow}>
          <span className={classes.summaryLabel}>{t('treatment_plan.total_cost')}</span>
          <Mono>
            <span className={classes.summaryValue}>
              {vm.totalCostText} {t('common.currency')}
            </span>
          </Mono>
        </div>

        <div>
          <div className={classes.progressTrack}>
            <div className={classes.progressFill} style={{ width: `${progressPct}%` }} />
          </div>
          <div className={classes.progressMeta} style={{ marginTop: 6 }}>
            <Mono>
              {completedStages}/{totalStages}
            </Mono>{' '}
            · <Mono>{progressPct}%</Mono>
          </div>
        </div>

        <Button
          variant="default"
          fullWidth
          leftSection={<IconWritingSign size={16} />}
          onClick={consent.open}
        >
          {t('treatment_plan.sign_consent')}
        </Button>
      </aside>

      <EstimateView planId={plan.id} opened={estimateOpened} onClose={estimate.close} />

      <Modal
        opened={consentOpened}
        onClose={consent.close}
        title={t('treatment_plan.sign_consent')}
      >
        <Stack gap="md">
          <TextInput
            label={t('treatment_plan.consent_signature_url')}
            value={signatureUrl}
            onChange={(e) => setSignatureUrl(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={consent.close}>
              {t('common.cancel')}
            </Button>
            <Button loading={consentPending} onClick={submitConsent}>
              {t('treatment_plan.sign_consent')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
