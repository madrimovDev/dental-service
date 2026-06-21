import type {
  SignTreatmentPlanConsentBody,
  TreatmentPlanWithStages,
  TreatmentStageAcceptance,
  TreatmentStageStatus,
} from '@dental/api-client';
import { StatusPill } from '@dental/ui';
import { Box, Button, Group, Modal, Paper, Stack, Text, TextInput } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconCheck, IconFileText, IconReceipt2, IconWritingSign } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toPlanCardVM } from '../../clinical.mappers';
import { EstimateView } from './EstimateView';
import { StageRow } from './StageRow';

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
  planStatusPending: boolean;
  onSignConsent: (planId: string, body: SignTreatmentPlanConsentBody) => void;
  consentPending: boolean;
}) {
  const { t } = useTranslation();
  const vm = toPlanCardVM(plan);
  const [estimateOpened, estimate] = useDisclosure(false);
  const [consentOpened, consent] = useDisclosure(false);
  const [signatureUrl, setSignatureUrl] = useState('');

  const proposedStageIds = plan.stages.filter((s) => s.acceptance === 'proposed').map((s) => s.id);
  const hasConsent = plan.consentSignedAt != null;

  const submitConsent = () => {
    onSignConsent(plan.id, signatureUrl ? { consentSignatureUrl: signatureUrl } : {});
    consent.close();
    setSignatureUrl('');
  };

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Box>
          <Group justify="space-between" align="flex-start">
            <Text fw={700}>{vm.title}</Text>
            <Button
              size="compact-xs"
              variant="light"
              leftSection={<IconReceipt2 size={14} />}
              onClick={estimate.open}
            >
              {t('treatment_plan.estimate_open')}
            </Button>
          </Group>
          <Group gap="xs" mt={4}>
            <StatusPill status={vm.statusTone}>{t(vm.statusLabelKey)}</StatusPill>
            <Text size="sm" c="dimmed">
              {t('treatment_plan.total_cost')}: {vm.totalCostText} {t('common.currency')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('treatment_plan.total_visits')}: {vm.totalVisits}
            </Text>
            {hasConsent && (
              <StatusPill status="success">{t('treatment_plan.consent_signed')}</StatusPill>
            )}
          </Group>
        </Box>

        {canEdit && (
          <Group gap="xs">
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
          </Group>
        )}

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
      </Stack>

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
    </Paper>
  );
}
