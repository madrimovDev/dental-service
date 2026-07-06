import type { CreateVisitNoteInput, Diagnosis } from '@dental/api-client';
import type { ComboboxItem, OptionsFilter } from '@mantine/core';
import { Button, Group, Modal, MultiSelect, Select, Stack, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { diagnosisSearchIndex, normalizeSearch, toDiagnosisOptions } from '../../clinical.mappers';
import { type VisitNoteFormValues, visitNoteFormSchema } from '../../clinical.schema';

export function VisitNoteFormModal({
  opened,
  onClose,
  patientId,
  doctorId,
  diagnoses,
  appointments,
  services,
  onCreate,
  pending,
}: {
  opened: boolean;
  onClose: () => void;
  patientId: string;
  doctorId: string;
  diagnoses: Diagnosis[];
  appointments: { id: string; startTime: string }[];
  // CLI-414: BOM auto-deduction (Qaror #15) uchun aktiv xizmat katalogi opsiyalari.
  services: { value: string; label: string }[];
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
      performedServices: [],
    },
    validate: zod4Resolver(visitNoteFormSchema),
  });

  const dxOptions = toDiagnosisOptions(diagnoses, i18n.language === 'ru' ? 'ru' : 'uz');
  // ICD-10 qidiruvi code + nameUz + nameRu bo'yicha (default filter faqat label/bitta tilni
  // tekshirardi → boshqa tildagi nom topilmasdi, CLI-152). latin↔kirill transliteratsiya emas.
  const dxFilter = useMemo<OptionsFilter>(() => {
    const index = diagnosisSearchIndex(diagnoses);
    return ({ options, search }) => {
      const q = normalizeSearch(search.trim());
      if (!q) return options;
      return options.filter(
        (o) => 'value' in o && (index.get((o as ComboboxItem).value)?.includes(q) ?? false),
      );
    };
  }, [diagnoses]);
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
      // CLI-414: bo'sh → undefined (stock'ga tegilmaydi).
      performedServices: values.performedServices.length > 0 ? values.performedServices : undefined,
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
            filter={dxFilter}
            limit={20}
            {...form.getInputProps('assessmentDiagnoses')}
          />
          <Textarea label={`P: ${t('visit_note.plan')}`} rows={3} {...form.getInputProps('plan')} />
          <MultiSelect
            label={t('visit_note.performed_services')}
            placeholder={t('visit_note.performed_services_placeholder')}
            searchable
            clearable
            data={services}
            {...form.getInputProps('performedServices')}
          />
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
