import type {
  SignTreatmentPlanConsentBody,
  ToothState,
  TreatmentPlanStatus,
  TreatmentPlanWithStages,
  TreatmentStageAcceptance,
  TreatmentStageStatus,
} from '@dental/api-client';
import { Mono, StatusPill } from '@dental/ui';
import {
  ActionIcon,
  Button,
  Divider,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBan,
  IconCheck,
  IconCircleCheck,
  IconDots,
  IconFileText,
  IconPlayerPlay,
  IconReceipt2,
  IconWritingSign,
} from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useConsentForms } from '../../clinical.api';
import { toConsentFormVM, toPlanCardVM } from '../../clinical.mappers';
import { ConsentSignForm } from '../consent/ConsentSignForm';
import { EstimatePanel } from './EstimateView';
import { StageRow } from './StageRow';
import classes from './TreatmentPlansTab.module.css';

// B4: backend transition jadvaliga mos (`treatment-plans.transitions.ts`, Qaror #25) —
// `cancelled` faqat terminal bo'lmagan statusdan (draft/presented/accepted/in_progress)
// ruxsat etiladi; UI shu jadvalga ORTIQCHA imkoniyat taklif qilmasligi kerak.
const CANCELLABLE_PLAN_STATUSES: readonly TreatmentPlanStatus[] = [
  'draft',
  'presented',
  'accepted',
  'in_progress',
];

// FX-61: davolash boshlangan/tugagan/bekor qilingan planda rozilikni (qayta) bog'lash yo'q —
// backend ham 409 (`plan.consent_locked`) qaytaradi.
const CONSENT_LOCKED_PLAN_STATUSES: readonly TreatmentPlanStatus[] = [
  'in_progress',
  'completed',
  'cancelled',
];

type PlanAction = {
  key: string;
  labelKey: string;
  icon: ReactNode;
  onClick: () => void;
  pending?: boolean;
  danger?: boolean;
};

export function PlanCard({
  plan,
  canEdit,
  onUpdateStage,
  onSetAcceptance,
  acceptancePending,
  onSetResultingState,
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
  onSetResultingState?: (stageId: string, state: ToothState | null) => void;
  onAcceptAll: (stageIds: string[]) => void;
  acceptAllPending: boolean;
  onPresentPlan: (planId: string) => void;
  // FT-01.5: «Bemor rozi bo'ldi» — rejani qabul qiladi va hali taklif holatidagi
  // bosqichlarni ham qabul qiladi (rad etilganlar o'zgarmaydi).
  onAcceptPlan: (planId: string, proposedStageIds: string[]) => void;
  // B4: accepted→in_progress/cancelled, in_progress→completed/cancelled va h.k.
  // (present/accept'dan farqli — bularga maxsus xato-xabar kerak emas, default
  // global toast — CLI-165 — yetarli).
  onSetPlanStatus: (planId: string, status: TreatmentPlanStatus) => void;
  planStatusPending: boolean;
  onSignConsent: (planId: string, body: SignTreatmentPlanConsentBody) => void;
  consentPending: boolean;
}) {
  const { t } = useTranslation();
  const vm = toPlanCardVM(plan);
  // FT-01.5: smeta o'ng panelda yig'iladi (modal emas); ochilgunicha so'rov yo'q.
  const [estimateOpened, estimate] = useDisclosure(false);
  const [consentOpened, consent] = useDisclosure(false);
  const [selectedConsentFormId, setSelectedConsentFormId] = useState<string | null>(null);
  const [signNewOpened, signNew] = useDisclosure(false);
  // FX-26: reja modalida inline imzolash (ConsentTab bilan bir xil forma) — `consent.manage` kerak.
  const canSignConsent = useAuthStore().hasPermission('consent.manage');

  // CLI-461 — "to'liq bog'lash": planni asoslovchi haqiqiy consent_forms yozuvi
  // linklanganmi (avval `consentSignedAt` cache tekshirilardi — endi haqiqiy manba
  // `consentFormId`, cache faqat informatsion).
  const proposedStageIds = plan.stages.filter((s) => s.acceptance === 'proposed').map((s) => s.id);
  const hasConsent = plan.consentFormId != null;
  const consentActionKey = hasConsent
    ? 'treatment_plan.renew_consent'
    : 'treatment_plan.sign_consent';
  const canCancelPlan = CANCELLABLE_PLAN_STATUSES.includes(plan.status);

  // FT-01.5 (spec §3): keyingi qadam — soddalashtirilgan oqim Qoralama → Bemorga
  // ko'rsatildi → (rozilik inline) Bemor rozi → Davolanmoqda → Tugadi. Backend o'tish
  // jadvaliga mos (`treatment-plans.transitions.ts`); accepted reja birinchi bosqich
  // boshlanganda o'zi in_progress bo'ladi, tugma esa qo'lda boshlash uchun qoladi.
  const consentAction: PlanAction = {
    key: 'consent',
    labelKey: consentActionKey,
    icon: <IconWritingSign size={14} />,
    onClick: consent.open,
  };
  const primaryAction: PlanAction | null =
    plan.status === 'draft'
      ? {
          key: 'present',
          labelKey: 'treatment_plan.present',
          icon: <IconFileText size={16} />,
          pending: planStatusPending,
          onClick: () => onPresentPlan(plan.id),
        }
      : plan.status === 'presented'
        ? // Consent gating (proaktiv): rozilik bo'lmasa keyingi qadam — imzolash (backend
          // ham presented→accepted'ni rozilikisiz 400 qaytaradi).
          hasConsent
          ? {
              key: 'accept',
              labelKey: 'treatment_plan.accept_plan',
              icon: <IconCheck size={16} />,
              pending: planStatusPending || acceptAllPending,
              onClick: () => onAcceptPlan(plan.id, proposedStageIds),
            }
          : { ...consentAction, icon: <IconWritingSign size={16} /> }
        : plan.status === 'accepted'
          ? {
              key: 'start',
              labelKey: 'treatment_plan.start_execution',
              icon: <IconPlayerPlay size={16} />,
              pending: planStatusPending,
              onClick: () => onSetPlanStatus(plan.id, 'in_progress'),
            }
          : plan.status === 'in_progress'
            ? {
                key: 'complete',
                labelKey: 'treatment_plan.complete_plan',
                icon: <IconCircleCheck size={16} />,
                pending: planStatusPending,
                onClick: () => onSetPlanStatus(plan.id, 'completed'),
              }
            : null;

  const isTerminal = plan.status === 'completed' || plan.status === 'cancelled';
  const menuActions: PlanAction[] = [];
  if (!isTerminal && proposedStageIds.length > 0) {
    menuActions.push({
      key: 'accept_all',
      labelKey: 'treatment_plan.accept_all',
      icon: <IconCheck size={14} />,
      pending: acceptAllPending,
      onClick: () => onAcceptAll(proposedStageIds),
    });
  }
  // FX-26 review: `hasConsent` faqat bog'langanini bildiradi, forma muddati o'tishi
  // mumkin — draft/presented/accepted'da qayta bog'lash doim mavjud (asosiy tugma
  // bo'lmasa — menyuda).
  if (!CONSENT_LOCKED_PLAN_STATUSES.includes(plan.status) && primaryAction?.key !== 'consent') {
    menuActions.push(consentAction);
  }
  if (canCancelPlan) {
    menuActions.push({
      key: 'cancel',
      labelKey: 'common.cancel',
      icon: <IconBan size={14} />,
      danger: true,
      pending: planStatusPending,
      onClick: () => onSetPlanStatus(plan.id, 'cancelled'),
    });
  }

  // Yil — plan.createdAt'dan (vizual sarlavha uchun; yangi data YO'Q).
  const year = plan.createdAt ? new Date(plan.createdAt).getFullYear() : null;

  // Progress — bajarilgan bosqichlar / jami (faqat presentation; backend YO'Q).
  const totalStages = plan.stages.length;
  const completedStages = plan.stages.filter((s) => s.status === 'completed').length;
  const progressPct = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;

  // CLI-461: konsent endi bo'sh/URL-only payload emas — bemorning MAVJUD, AMALDAGI
  // 'treatment' turidagi consent_forms yozuvlaridan biriga ("to'liq bog'lash")
  // havola qilinadi. `useConsentForms` faqat modal ochilganda kerak, lekin hook
  // shart-qoidasiz chaqirilishi kerak (React hooks qoidasi) — `enabled` orqali
  // yopiq holatda so'rov yubormaymiz.
  const consentFormsQuery = useConsentForms(plan.patientId, { enabled: consentOpened });
  const validConsentOptions = (consentFormsQuery.data ?? [])
    .map(toConsentFormVM)
    .filter((f) => f.type === 'treatment' && f.isValid);

  const submitConsent = () => {
    if (!selectedConsentFormId) return;
    onSignConsent(plan.id, { consentFormId: selectedConsentFormId });
    closeConsent();
  };

  const closeConsent = () => {
    consent.close();
    signNew.close();
    setSelectedConsentFormId(null);
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
        </div>

        <div className={classes.headChips}>
          <StatusPill status={vm.statusTone}>{t(vm.statusLabelKey)}</StatusPill>
          {hasConsent && (
            <StatusPill status="success">{t('treatment_plan.consent_signed')}</StatusPill>
          )}
        </div>

        {/* FT-01.5 (spec §3): BITTA asosiy tugma (keyingi qadam) + «…» menyu (qolgan amallar). */}
        {canEdit && (primaryAction || menuActions.length > 0) && (
          <div className={classes.actions}>
            {primaryAction && (
              <Button
                size="sm"
                h={44}
                color="teal"
                data-plan-primary="true"
                leftSection={primaryAction.icon}
                loading={primaryAction.pending}
                onClick={primaryAction.onClick}
              >
                {t(primaryAction.labelKey)}
              </Button>
            )}
            {menuActions.length > 0 && (
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    size={44}
                    variant="default"
                    aria-label={t('treatment_plan.more_actions')}
                    title={t('treatment_plan.more_actions')}
                  >
                    <IconDots size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {menuActions.map((a) => (
                    <Menu.Item
                      key={a.key}
                      leftSection={a.icon}
                      color={a.danger ? 'red' : undefined}
                      disabled={a.pending}
                      onClick={a.onClick}
                    >
                      {t(a.labelKey)}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
          </div>
        )}

        {totalStages > 0 && (
          <div>
            <div className={classes.tableHead}>
              <span className={classes.colNum}>#</span>
              <span>{t('treatment_plan.stages')}</span>
              <span className={classes.colTeeth}>{t('treatment_plan.tooth_numbers_short')}</span>
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
                  onSetResultingState={onSetResultingState}
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

        {/* FT-01.5 (spec §3): smeta/taqdimot — modal emas, shu panelning o'zida. */}
        <Button
          size="sm"
          h={44}
          variant="light"
          leftSection={<IconReceipt2 size={16} />}
          aria-expanded={estimateOpened}
          onClick={estimate.toggle}
        >
          {t(estimateOpened ? 'treatment_plan.estimate_hide' : 'treatment_plan.estimate_open')}
        </Button>
        {estimateOpened && <EstimatePanel planId={plan.id} />}
      </aside>

      <Modal opened={consentOpened} onClose={closeConsent} title={t(consentActionKey)}>
        <Stack gap="md">
          {consentFormsQuery.isLoading ? (
            <Text c="dimmed">{t('common.loading')}</Text>
          ) : validConsentOptions.length === 0 ? (
            <Text c="dimmed">{t('consent.no_valid_forms')}</Text>
          ) : (
            <>
              <Select
                label={t('consent.select_form')}
                placeholder={t('common.select')}
                data={validConsentOptions.map((f) => ({
                  value: f.id,
                  label: f.isPerpetual
                    ? f.title
                    : `${f.title} — ${t('consent.expires_label', { date: f.expiryText })}`,
                }))}
                value={selectedConsentFormId}
                onChange={setSelectedConsentFormId}
              />
              <Group justify="flex-end">
                <Button variant="default" onClick={closeConsent}>
                  {t('common.cancel')}
                </Button>
                <Button
                  loading={consentPending}
                  disabled={!selectedConsentFormId}
                  onClick={submitConsent}
                >
                  {t('treatment_plan.sign_consent')}
                </Button>
              </Group>
            </>
          )}

          {/* FX-26: yangi rozilikni shu modalning o'zida imzolash va rejaga bog'lash. */}
          {canSignConsent && !consentFormsQuery.isLoading && (
            <>
              <Divider />
              {validConsentOptions.length > 0 && !signNewOpened ? (
                <Button variant="subtle" onClick={signNew.open}>
                  {t('consent.sign_new')}
                </Button>
              ) : (
                <ConsentSignForm
                  patientId={plan.patientId}
                  fixedType="treatment"
                  onSigned={(form) => {
                    onSignConsent(plan.id, { consentFormId: form.id });
                    closeConsent();
                  }}
                  onCancel={closeConsent}
                />
              )}
            </>
          )}
        </Stack>
      </Modal>
    </div>
  );
}
