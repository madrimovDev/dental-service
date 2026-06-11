import type { CreateTreatmentPlanInput } from '@dental/api-client';
import {
  ActionIcon,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { parseToothNumbers } from '../../clinical.mappers';
import { type TreatmentPlanFormValues, treatmentPlanFormSchema } from '../../clinical.schema';

export function PlanFormModal({
  opened,
  onClose,
  patientId,
  doctorId,
  onCreate,
  pending,
}: {
  opened: boolean;
  onClose: () => void;
  patientId: string;
  doctorId: string;
  onCreate: (body: CreateTreatmentPlanInput) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const form = useForm<TreatmentPlanFormValues>({
    initialValues: { title: '', notes: '', stages: [] },
    validate: zod4Resolver(treatmentPlanFormSchema),
  });

  const submit = form.onSubmit((values) => {
    onCreate({
      patientId,
      doctorId,
      title: values.title,
      notes: values.notes || undefined,
      stages: values.stages.map((s) => ({
        serviceName: s.serviceName,
        toothNumbers: parseToothNumbers(s.toothNumbersText),
        estimatedVisits: s.estimatedVisits,
        estimatedDurationMinutes: s.estimatedDurationMinutes,
        cost: s.cost,
        notes: s.notes,
      })),
    });
  });

  return (
    <Modal opened={opened} onClose={onClose} title={t('treatment_plan.create')} size="xl">
      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            label={t('treatment_plan.plan_title')}
            required
            {...form.getInputProps('title')}
          />
          <Textarea label={t('treatment_plan.notes')} rows={2} {...form.getInputProps('notes')} />
          <Group justify="space-between">
            <Text fw={600}>{t('treatment_plan.stages')}</Text>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() =>
                form.insertListItem('stages', {
                  serviceName: '',
                  toothNumbersText: '',
                  estimatedVisits: 1,
                  cost: 0,
                })
              }
            >
              {t('treatment_plan.add_stage')}
            </Button>
          </Group>
          {form.values.stages.length === 0 && (
            <Text c="dimmed">{t('treatment_plan.no_stages')}</Text>
          )}
          {form.values.stages.map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ephemeral draft list
            <Card withBorder key={`stage-${i}`} padding="sm">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600}>#{i + 1}</Text>
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    onClick={() => form.removeListItem('stages', i)}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
                <TextInput
                  label={t('treatment_plan.service_name')}
                  {...form.getInputProps(`stages.${i}.serviceName`)}
                />
                <TextInput
                  label={t('treatment_plan.tooth_numbers')}
                  placeholder="11, 12, 36"
                  description={t('treatment_plan.tooth_numbers_hint')}
                  {...form.getInputProps(`stages.${i}.toothNumbersText`)}
                />
                <Group grow>
                  <NumberInput
                    label={t('treatment_plan.estimated_visits')}
                    min={1}
                    {...form.getInputProps(`stages.${i}.estimatedVisits`)}
                  />
                  <NumberInput
                    label={t('treatment_plan.duration_minutes')}
                    min={0}
                    {...form.getInputProps(`stages.${i}.estimatedDurationMinutes`)}
                  />
                  <NumberInput
                    label={t('treatment_plan.cost')}
                    min={0}
                    {...form.getInputProps(`stages.${i}.cost`)}
                  />
                </Group>
              </Stack>
            </Card>
          ))}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={pending} disabled={!form.isValid()}>
              {t('treatment_plan.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
