import type { CreateVisitNoteInput, Diagnosis } from '@dental/api-client';
import { Button, Group, Modal, MultiSelect, Select, Stack, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useTranslation } from 'react-i18next';
import { toDiagnosisOptions } from '../../clinical.mappers';
import { type VisitNoteFormValues, visitNoteFormSchema } from '../../clinical.schema';

export function VisitNoteFormModal({
  opened,
  onClose,
  patientId,
  doctorId,
  diagnoses,
  appointments,
  onCreate,
  pending,
}: {
  opened: boolean;
  onClose: () => void;
  patientId: string;
  doctorId: string;
  diagnoses: Diagnosis[];
  appointments: { id: string; startTime: string }[];
  onCreate: (body: CreateVisitNoteInput) => void;
  pending: boolean;
}) {
  const { t, i18n } = useTranslation();
  const form = useForm<VisitNoteFormValues>({
    initialValues: {
      subjective: '',
      objective: '',
      assessmentDiagnoses: [],
      plan: '',
      freeNotes: '',
      appointmentId: null,
    },
    validate: zod4Resolver(visitNoteFormSchema),
  });

  const dxOptions = toDiagnosisOptions(diagnoses, i18n.language === 'ru' ? 'ru' : 'uz');
  const apptOptions = appointments.map((a) => ({
    value: a.id,
    label: new Date(a.startTime).toLocaleString(),
  }));

  const close = () => {
    form.reset();
    onClose();
  };

  const submit = form.onSubmit((values) => {
    onCreate({
      patientId,
      doctorId,
      subjective: values.subjective || undefined,
      objective: values.objective || undefined,
      assessmentDiagnoses: values.assessmentDiagnoses,
      plan: values.plan || undefined,
      freeNotes: values.freeNotes || undefined,
      appointmentId: values.appointmentId ?? undefined,
    });
  });

  return (
    <Modal opened={opened} onClose={close} title={t('visit_note.create')} size="xl">
      <form onSubmit={submit}>
        <Stack gap="md">
          <Select
            label={t('visit_note.appointment')}
            placeholder={t('visit_note.no_appointment')}
            data={apptOptions}
            clearable
            {...form.getInputProps('appointmentId')}
          />
          <Textarea
            label={`S: ${t('visit_note.subjective')}`}
            rows={3}
            {...form.getInputProps('subjective')}
          />
          <Textarea
            label={`O: ${t('visit_note.objective')}`}
            rows={3}
            {...form.getInputProps('objective')}
          />
          <MultiSelect
            label={`A: ${t('visit_note.assessment')}`}
            placeholder={t('visit_note.diagnosis_picker')}
            searchable
            data={dxOptions}
            limit={20}
            {...form.getInputProps('assessmentDiagnoses')}
          />
          <Textarea label={`P: ${t('visit_note.plan')}`} rows={3} {...form.getInputProps('plan')} />
          <Textarea
            label={t('visit_note.free_notes')}
            rows={2}
            {...form.getInputProps('freeNotes')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={pending}>
              {t('visit_note.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
