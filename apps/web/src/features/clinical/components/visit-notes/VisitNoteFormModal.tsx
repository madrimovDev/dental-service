import type { CreateVisitNoteInput, Diagnosis } from '@dental/api-client';
import { Button, Group, Modal, MultiSelect, Select, Stack, Textarea } from '@mantine/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toDiagnosisOptions } from '../../clinical.mappers';

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
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [dxIds, setDxIds] = useState<string[]>([]);
  const [plan, setPlan] = useState('');
  const [freeNotes, setFreeNotes] = useState('');
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  const dxOptions = toDiagnosisOptions(diagnoses, i18n.language === 'ru' ? 'ru' : 'uz');
  const apptOptions = appointments.map((a) => ({
    value: a.id,
    label: new Date(a.startTime).toLocaleString(),
  }));

  const reset = () => {
    setSubjective('');
    setObjective('');
    setDxIds([]);
    setPlan('');
    setFreeNotes('');
    setAppointmentId(null);
  };

  const submit = () => {
    onCreate({
      patientId,
      doctorId,
      subjective: subjective || undefined,
      objective: objective || undefined,
      assessmentDiagnoses: dxIds,
      plan: plan || undefined,
      freeNotes: freeNotes || undefined,
      appointmentId: appointmentId ?? undefined,
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t('visit_note.create')}
      size="xl"
    >
      <Stack gap="md">
        <Select
          label={t('visit_note.appointment')}
          placeholder={t('visit_note.no_appointment')}
          data={apptOptions}
          value={appointmentId}
          onChange={setAppointmentId}
          clearable
        />
        <Textarea
          label={`S: ${t('visit_note.subjective')}`}
          rows={3}
          value={subjective}
          onChange={(e) => setSubjective(e.currentTarget.value)}
        />
        <Textarea
          label={`O: ${t('visit_note.objective')}`}
          rows={3}
          value={objective}
          onChange={(e) => setObjective(e.currentTarget.value)}
        />
        <MultiSelect
          label={`A: ${t('visit_note.assessment')}`}
          placeholder={t('visit_note.diagnosis_picker')}
          searchable
          data={dxOptions}
          value={dxIds}
          onChange={setDxIds}
          limit={20}
        />
        <Textarea
          label={`P: ${t('visit_note.plan')}`}
          rows={3}
          value={plan}
          onChange={(e) => setPlan(e.currentTarget.value)}
        />
        <Textarea
          label={t('visit_note.free_notes')}
          rows={2}
          value={freeNotes}
          onChange={(e) => setFreeNotes(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button
            variant="default"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={pending}>
            {t('visit_note.save')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
