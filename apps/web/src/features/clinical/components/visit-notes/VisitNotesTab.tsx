import type { Diagnosis } from '@dental/api-client';
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useCreateVisitNote,
  useDiagnoses,
  usePatientAppointments,
  useVisitNotes,
} from '../../clinical.api';
import { VisitNoteCard } from './VisitNoteCard';
import { VisitNoteFormModal } from './VisitNoteFormModal';

type Props = { patientId: string };

export function VisitNotesTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuthStore();
  const [opened, { open, close }] = useDisclosure(false);
  const canEdit = hasPermission('medical_record.edit');

  const notesQuery = useVisitNotes(patientId);
  const diagnosesQuery = useDiagnoses();
  const apptQuery = usePatientAppointments(patientId);
  const createMut = useCreateVisitNote(patientId);

  const diagnosisMap = useMemo(() => {
    const map = new Map<string, Diagnosis>();
    for (const d of diagnosesQuery.data ?? []) map.set(d.id, d);
    return map;
  }, [diagnosesQuery.data]);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('visit_note.title')}</Title>
        {canEdit && (
          <Button leftSection={<IconPlus size={16} />} onClick={open}>
            {t('visit_note.create')}
          </Button>
        )}
      </Group>

      {notesQuery.isLoading && <Text>{t('common.loading')}</Text>}
      {!notesQuery.isLoading && notesQuery.data?.length === 0 && (
        <Paper withBorder p="md">
          <Text c="dimmed">{t('visit_note.empty')}</Text>
        </Paper>
      )}

      {notesQuery.data?.map((note) => (
        <VisitNoteCard key={note.id} note={note} diagnosisMap={diagnosisMap} />
      ))}

      {user && (
        <VisitNoteFormModal
          opened={opened}
          onClose={close}
          patientId={patientId}
          doctorId={user.id}
          diagnoses={diagnosesQuery.data ?? []}
          appointments={apptQuery.data ?? []}
          pending={createMut.isPending}
          onCreate={(body) => createMut.mutate(body, { onSuccess: close })}
        />
      )}
    </Stack>
  );
}
