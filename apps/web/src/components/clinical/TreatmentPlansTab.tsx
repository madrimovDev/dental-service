import type {
  CreateTreatmentStageInput,
  TreatmentPlanStatus,
  TreatmentStageStatus,
} from '@dental/api-client';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

type Props = { patientId: string };

const planStatusColors: Record<TreatmentPlanStatus, string> = {
  draft: 'gray',
  presented: 'blue',
  accepted: 'cyan',
  in_progress: 'orange',
  completed: 'green',
  cancelled: 'red',
};

const stageStatusColors: Record<TreatmentStageStatus, string> = {
  pending: 'gray',
  in_progress: 'orange',
  completed: 'green',
  skipped: 'red',
};

type StageDraft = CreateTreatmentStageInput & { toothNumbersText: string };

export function TreatmentPlansTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [stages, setStages] = useState<StageDraft[]>([]);

  const plansQuery = useQuery({
    queryKey: ['treatment-plans', patientId],
    queryFn: () => api.clinical.listPlans(patientId),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('No user');
      return api.clinical.createPlan({
        patientId,
        doctorId: user.id,
        title,
        notes: notes || undefined,
        stages: stages.map((s) => ({
          serviceName: s.serviceName,
          toothNumbers: s.toothNumbersText
            ? s.toothNumbersText
                .split(',')
                .map((n) => Number(n.trim()))
                .filter((n) => !Number.isNaN(n))
            : undefined,
          estimatedVisits: s.estimatedVisits,
          estimatedDurationMinutes: s.estimatedDurationMinutes,
          cost: s.cost,
          notes: s.notes,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treatment-plans', patientId] });
      setTitle('');
      setNotes('');
      setStages([]);
      close();
    },
  });

  const updateStageMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TreatmentStageStatus }) =>
      api.clinical.updateStage(id, { status }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['treatment-plan-detail'] });
      qc.invalidateQueries({ queryKey: ['treatment-plans', patientId] });
      // also invalidate the specific plan detail in case it's expanded
      void vars;
    },
  });

  const addStage = () => {
    setStages([
      ...stages,
      {
        serviceName: '',
        toothNumbersText: '',
        estimatedVisits: 1,
        cost: 0,
      },
    ]);
  };

  const canEdit = hasPermission('medical_record.edit');

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

      {plansQuery.isLoading && <Text>{t('common.loading')}</Text>}
      {!plansQuery.isLoading && plansQuery.data?.length === 0 && (
        <Paper withBorder p="md">
          <Text c="dimmed">{t('treatment_plan.empty')}</Text>
        </Paper>
      )}

      {plansQuery.data?.map((plan) => (
        <PlanCard
          key={plan.id}
          planId={plan.id}
          title={plan.title}
          status={plan.status}
          totalCost={plan.totalCost}
          totalVisits={plan.totalVisits}
          canEdit={canEdit}
          onUpdateStage={(id, status) => updateStageMut.mutate({ id, status })}
        />
      ))}

      <Modal opened={opened} onClose={close} title={t('treatment_plan.create')} size="xl">
        <Stack gap="md">
          <TextInput
            label={t('treatment_plan.plan_title')}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            required
          />
          <Textarea
            label={t('treatment_plan.notes')}
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            rows={2}
          />
          <Group justify="space-between">
            <Text fw={600}>{t('treatment_plan.stages')}</Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={addStage}
            >
              {t('treatment_plan.add_stage')}
            </Button>
          </Group>
          {stages.length === 0 && <Text c="dimmed">{t('treatment_plan.no_stages')}</Text>}
          {stages.map((stage, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ephemeral draft list
            <Card withBorder key={`stage-${i}`} padding="sm">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600}>#{i + 1}</Text>
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() => setStages(stages.filter((_, idx) => idx !== i))}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
                <TextInput
                  label={t('treatment_plan.service_name')}
                  value={stage.serviceName}
                  onChange={(e) => {
                    const next = [...stages];
                    next[i] = { ...stage, serviceName: e.currentTarget.value };
                    setStages(next);
                  }}
                />
                <TextInput
                  label={t('treatment_plan.tooth_numbers')}
                  placeholder="11, 12, 36"
                  description={t('treatment_plan.tooth_numbers_hint')}
                  value={stage.toothNumbersText}
                  onChange={(e) => {
                    const next = [...stages];
                    next[i] = { ...stage, toothNumbersText: e.currentTarget.value };
                    setStages(next);
                  }}
                />
                <Group grow>
                  <NumberInput
                    label={t('treatment_plan.estimated_visits')}
                    min={1}
                    value={stage.estimatedVisits ?? 1}
                    onChange={(v) => {
                      const next = [...stages];
                      next[i] = { ...stage, estimatedVisits: Number(v) || 1 };
                      setStages(next);
                    }}
                  />
                  <NumberInput
                    label={t('treatment_plan.duration_minutes')}
                    min={0}
                    value={stage.estimatedDurationMinutes ?? undefined}
                    onChange={(v) => {
                      const next = [...stages];
                      next[i] = { ...stage, estimatedDurationMinutes: Number(v) || undefined };
                      setStages(next);
                    }}
                  />
                  <NumberInput
                    label={t('treatment_plan.cost')}
                    min={0}
                    value={stage.cost}
                    onChange={(v) => {
                      const next = [...stages];
                      next[i] = { ...stage, cost: Number(v) || 0 };
                      setStages(next);
                    }}
                  />
                </Group>
              </Stack>
            </Card>
          ))}
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              loading={createMut.isPending}
              disabled={!title || stages.length === 0 || stages.some((s) => !s.serviceName)}
            >
              {t('treatment_plan.save')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );

  function PlanCard({
    planId,
    title,
    status,
    totalCost,
    totalVisits,
    canEdit,
    onUpdateStage,
  }: {
    planId: string;
    title: string;
    status: TreatmentPlanStatus;
    totalCost: string;
    totalVisits: number;
    canEdit: boolean;
    onUpdateStage: (stageId: string, status: TreatmentStageStatus) => void;
  }) {
    const detailQuery = useQuery({
      queryKey: ['treatment-plan-detail', planId],
      queryFn: () => api.clinical.getPlan(planId),
    });

    return (
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Box>
              <Text fw={700}>{title}</Text>
              <Group gap="xs" mt={4}>
                <Badge color={planStatusColors[status]}>
                  {t(`treatment_plan.status_${status}`)}
                </Badge>
                <Text size="sm" c="dimmed">
                  {t('treatment_plan.total_cost')}: {Number(totalCost).toLocaleString()} UZS
                </Text>
                <Text size="sm" c="dimmed">
                  {t('treatment_plan.total_visits')}: {totalVisits}
                </Text>
              </Group>
            </Box>
          </Group>
          {detailQuery.data?.stages.map((stage) => (
            <Card key={stage.id} withBorder padding="sm">
              <Group justify="space-between">
                <Box>
                  <Text fw={500}>
                    #{stage.sequence}. {stage.serviceName}
                  </Text>
                  <Group gap="xs">
                    {stage.toothNumbers && stage.toothNumbers.length > 0 && (
                      <Text size="sm" c="dimmed">
                        🦷 {stage.toothNumbers.join(', ')}
                      </Text>
                    )}
                    <Text size="sm" c="dimmed">
                      {Number(stage.cost).toLocaleString()} UZS
                    </Text>
                    <Badge size="sm" color={stageStatusColors[stage.status]}>
                      {t(`treatment_plan.stage_status_${stage.status}`)}
                    </Badge>
                  </Group>
                </Box>
                {canEdit && (
                  <Select
                    size="xs"
                    w={140}
                    value={stage.status}
                    onChange={(v) => v && onUpdateStage(stage.id, v as TreatmentStageStatus)}
                    data={[
                      { value: 'pending', label: t('treatment_plan.stage_status_pending') },
                      { value: 'in_progress', label: t('treatment_plan.stage_status_in_progress') },
                      { value: 'completed', label: t('treatment_plan.stage_status_completed') },
                      { value: 'skipped', label: t('treatment_plan.stage_status_skipped') },
                    ]}
                  />
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      </Paper>
    );
  }
}
