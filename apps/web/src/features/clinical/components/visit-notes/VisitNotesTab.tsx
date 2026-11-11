import type { Diagnosis, VisitNote } from '@dental/api-client';
import { StateView } from '@dental/ui';
import { Button, Group, Stack, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDiagnoses, useVisitNotes } from '../../clinical.api';
import { VisitNoteCard } from './VisitNoteCard';

type Props = { patientId: string };

/**
 * Vizit yozuvlari ro'yxati. UI-D4: yaratish/tahrirlash modal EMAS — alohida sahifa
 * (`/patients/:id/visits/new`, `/patients/:id/visits/:visitId/edit`).
 */
export function VisitNotesTab({ patientId }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const canEdit = hasPermission('medical_record.edit');

  const notesQuery = useVisitNotes(patientId);
  const diagnosesQuery = useDiagnoses();

  const diagnosisMap = useMemo(() => {
    const map = new Map<string, Diagnosis>();
    for (const d of diagnosesQuery.data ?? []) map.set(d.id, d);
    return map;
  }, [diagnosesQuery.data]);

  const openCreate = () => navigate(`/patients/${patientId}/visits/new`);
  const openEdit = (note: VisitNote) => navigate(`/patients/${patientId}/visits/${note.id}/edit`);

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
    </Stack>
  );
}
