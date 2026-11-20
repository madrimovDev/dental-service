import {
  ApiError,
  type SignTreatmentPlanConsentBody,
  type ToothState,
  type TreatmentPlanStatus,
  type TreatmentStageAcceptance,
  type TreatmentStageStatus,
} from '@dental/api-client';
import { StateView } from '@dental/ui';
import { Button, Group, Stack, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useAcceptAllStages,
  useCreatePlan,
  useSignPlanConsent,
  useTreatmentPlans,
  useUpdatePlanStatus,
  useUpdateStage,
  useUpdateStageAcceptance,
  useUpdateStageResultingState,
} from '../../clinical.api';
import { PlanCard } from './PlanCard';
import { PlanFormModal } from './PlanFormModal';

type Props = { patientId: string };

export function TreatmentPlansTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuthStore();
  const [opened, { open, close }] = useDisclosure(false);
  const canEdit = hasPermission('medical_record.edit');

  const plansQuery = useTreatmentPlans(patientId);
  const createMut = useCreatePlan(patientId);
  const updateStageMut = useUpdateStage(patientId);
  const acceptanceMut = useUpdateStageAcceptance(patientId);
  const resultingStateMut = useUpdateStageResultingState(patientId);
  const acceptAllMut = useAcceptAllStages(patientId);
  const planStatusMut = useUpdatePlanStatus(patientId);
  const consentMut = useSignPlanConsent(patientId);

  const onUpdateStage = (id: string, status: TreatmentStageStatus) =>
    updateStageMut.mutate({ id, status });

  const onSetResultingState = (id: string, resultingToothState: ToothState | null) =>
    resultingStateMut.mutate({ id, resultingToothState });

  const onSetAcceptance = (id: string, acceptance: TreatmentStageAcceptance) =>
    acceptanceMut.mutate({ id, acceptance });

  const onAcceptAll = (stageIds: string[]) =>
    acceptAllMut.mutate(stageIds, {
      onSuccess: ({ total, rejected }) => {
        if (rejected > 0) {
          notifications.show({
            color: 'red',
            message: t('treatment_plan.accept_all_partial', { rejected }),
          });
        } else {
          notifications.show({
            color: 'teal',
            message: t('treatment_plan.accept_all_result', { accepted: total }),
          });
        }
      },
    });

  const onPresentPlan = (id: string) => planStatusMut.mutate({ id, status: 'presented' });

  // FT-01.5: «Bemor rozi bo'ldi» — avval reja qabul qilinadi (rozilik gate'i shu yerda;
  // rad etilsa bosqichlar o'zgarmaydi), keyin hali taklif holatidagi bosqichlar ham
  // qabul qilinadi (alohida «Hammasini qabul qilish» qadami birlashtirildi). Rad
  // etilgan bosqichlarga tegilmaydi.
  const onAcceptPlan = (id: string, proposedStageIds: string[]) =>
    planStatusMut.mutate(
      { id, status: 'accepted' },
      {
        onSuccess: () => {
          if (proposedStageIds.length > 0) onAcceptAll(proposedStageIds);
        },
        // Consent-required 400'ni aniq xabar bilan ko'rsatamiz (global toast generik — CLI-165).
        onError: (err) => {
          const message =
            err instanceof ApiError && err.code === 'plan.consent_required'
              ? t('treatment_plan.consent_required')
              : t('common.error');
          notifications.show({ color: 'red', message });
        },
      },
    );

  // B4 (CLI-439): accepted→in_progress/cancelled, in_progress→completed/cancelled va h.k.
  // (draft/presented→cancelled ham) — present/accept'dan farqli, maxsus xato-xabar
  // kerak emas (default global toast, CLI-165 yetarli).
  const onSetPlanStatus = (id: string, status: TreatmentPlanStatus) =>
    planStatusMut.mutate({ id, status });

  const onSignConsent = (id: string, body: SignTreatmentPlanConsentBody) =>
    consentMut.mutate({ id, body });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('treatment_plan.title')}</Title>
        {canEdit && (
          <Button leftSection={<IconPlus size={16} />} onClick={open}>
            {t('treatment_plan.create')}
          </Button>
        )}
      </Group>

      {plansQuery.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => plansQuery.refetch()}
        />
      ) : plansQuery.isLoading ? (
        <StateView status="loading" skeleton="cards" />
      ) : (plansQuery.data?.length ?? 0) === 0 ? (
        <StateView status="empty" title={t('treatment_plan.empty')} />
      ) : (
        plansQuery.data?.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            canEdit={canEdit}
            onUpdateStage={onUpdateStage}
            onSetAcceptance={onSetAcceptance}
            acceptancePending={acceptanceMut.isPending}
            onSetResultingState={onSetResultingState}
            onAcceptAll={onAcceptAll}
            acceptAllPending={acceptAllMut.isPending}
            onPresentPlan={onPresentPlan}
            onAcceptPlan={onAcceptPlan}
            onSetPlanStatus={onSetPlanStatus}
            planStatusPending={planStatusMut.isPending}
            onSignConsent={onSignConsent}
            consentPending={consentMut.isPending}
          />
        ))
      )}

      {user && (
        <PlanFormModal
          opened={opened}
          onClose={close}
          patientId={patientId}
          doctorId={user.id}
          pending={createMut.isPending}
          onCreate={(body, callbacks) => createMut.mutate(body, callbacks)}
        />
      )}
    </Stack>
  );
}
