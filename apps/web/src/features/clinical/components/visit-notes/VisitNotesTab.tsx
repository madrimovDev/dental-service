import type { Diagnosis, VisitNote } from '@dental/api-client';
import { StateView } from '@dental/ui';
import { Button, Group, Stack, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import {
  useCreateVisitNote,
  useDiagnoses,
  usePatientAppointments,
  useServiceCatalog,
  useTreatmentPlans,
  useUpdateVisitNote,
  useVisitNotes,
} from '../../clinical.api';
import { VisitNoteCard } from './VisitNoteCard';
import { VisitNoteFormModal } from './VisitNoteFormModal';

type Props = { patientId: string };

export function VisitNotesTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuthStore();
  const [opened, { open, close }] = useDisclosure(false);
  // CLI-447: null = yaratish, VisitNote = tahrirlash.
  const [editingNote, setEditingNote] = useState<VisitNote | null>(null);
  const canEdit = hasPermission('medical_record.edit');

  const notesQuery = useVisitNotes(patientId);
  const diagnosesQuery = useDiagnoses();
  const apptQuery = usePatientAppointments(patientId);
  const servicesQuery = useServiceCatalog();
  const plansQuery = useTreatmentPlans(patientId);
  const createMut = useCreateVisitNote(patientId);
  const updateMut = useUpdateVisitNote(patientId);

  const diagnosisMap = useMemo(() => {
    const map = new Map<string, Diagnosis>();
    for (const d of diagnosesQuery.data ?? []) map.set(d.id, d);
    return map;
  }, [diagnosesQuery.data]);

  // CLI-414: BOM auto-deduction uchun aktiv xizmat katalogi.
  const serviceOptions = useMemo(
    () =>
      (servicesQuery.data ?? [])
        .filter((s) => s.isActive)
        .map((s) => ({ value: s.id, label: `${s.code} — ${s.nameUz}` })),
    [servicesQuery.data],
  );

  // CLI-447: davolash rejasi bosqichlari — stageId Select opsiyalari (reja · bosqich).
  const stageOptions = useMemo(
    () =>
      (plansQuery.data ?? []).flatMap((p) =>
        (p.stages ?? []).map((s) => ({
          value: s.id,
          label: `${p.title} · ${s.sequence}. ${s.serviceName}`,
        })),
      ),
    [plansQuery.data],
  );

  const openCreate = () => {
    setEditingNote(null);
    open();
  };
  const openEdit = (note: VisitNote) => {
    setEditingNote(note);
    open();
  };
  const closeModal = () => {
    close();
    setEditingNote(null);
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('visit_note.title')}</Title>
        {canEdit && (
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            {t('visit_note.create')}
          </Button>
        )}
      </Group>

      {notesQuery.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => notesQuery.refetch()}
        />
      ) : notesQuery.isLoading ? (
        <StateView status="loading" skeleton="cards" />
      ) : (notesQuery.data?.length ?? 0) === 0 ? (
        <StateView status="empty" title={t('visit_note.empty')} />
      ) : (
        notesQuery.data?.map((note) => (
          <VisitNoteCard
            key={note.id}
            note={note}
            diagnosisMap={diagnosisMap}
            onEdit={canEdit ? () => openEdit(note) : undefined}
          />
        ))
      )}

      {user && (
        <VisitNoteFormModal
          opened={opened}
          onClose={closeModal}
          patientId={patientId}
          doctorId={user.id}
          diagnoses={diagnosesQuery.data ?? []}
          appointments={apptQuery.data ?? []}
          services={serviceOptions}
          stages={stageOptions}
          note={editingNote}
          pending={createMut.isPending || updateMut.isPending}
          onSubmit={(body) => {
            if (editingNote) {
              // CLI-447: update — patientId/doctorId'siz (backend omit patientId).
              const { patientId: _p, doctorId: _d, ...rest } = body;
              updateMut.mutate({ id: editingNote.id, body: rest }, { onSuccess: closeModal });
            } else {
              createMut.mutate(body, { onSuccess: closeModal });
            }
          }}
        />
      )}
    </Stack>
  );
}
