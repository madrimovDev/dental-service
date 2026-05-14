import type { Diagnosis } from '@dental/api-client';
import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  MultiSelect,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

type Props = { patientId: string };

export function VisitNotesTab({ patientId }: Props) {
  const { t, i18n } = useTranslation();
  const { user, hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);

  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [selectedDiagnosisIds, setSelectedDiagnosisIds] = useState<string[]>([]);
  const [plan, setPlan] = useState('');
  const [freeNotes, setFreeNotes] = useState('');

  const notesQuery = useQuery({
    queryKey: ['visit-notes', patientId],
    queryFn: () => api.clinical.listVisitNotes(patientId),
  });

  const diagnosesQuery = useQuery({
    queryKey: ['diagnoses'],
    queryFn: () => api.clinical.listDiagnoses(),
    staleTime: 1000 * 60 * 60, // 1 hour — ICD-10 doesn't change
  });

  const diagnosisMap = useMemo(() => {
    const map = new Map<string, Diagnosis>();
    for (const d of diagnosesQuery.data ?? []) map.set(d.id, d);
    return map;
  }, [diagnosesQuery.data]);

  const diagnosisOptions = useMemo(
    () =>
      (diagnosesQuery.data ?? []).map((d) => ({
        value: d.id,
        label: `${d.code} — ${i18n.language === 'ru' ? d.nameRu : d.nameUz}`,
      })),
    [diagnosesQuery.data, i18n.language],
  );

  const createMut = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('No user');
      return api.clinical.createVisitNote({
        patientId,
        doctorId: user.id,
        subjective: subjective || undefined,
        objective: objective || undefined,
        assessmentDiagnoses: selectedDiagnosisIds,
        plan: plan || undefined,
        freeNotes: freeNotes || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit-notes', patientId] });
      setSubjective('');
      setObjective('');
      setSelectedDiagnosisIds([]);
      setPlan('');
      setFreeNotes('');
      close();
    },
  });

  const canEdit = hasPermission('medical_record.edit');

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
        <Card key={note.id} withBorder padding="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={700}>📅 {new Date(note.visitDate).toLocaleString()}</Text>
            </Group>
            {note.subjective && (
              <Box>
                <Text size="sm" fw={600} c="blue">
                  S: {t('visit_note.subjective')}
                </Text>
                <Text size="sm">{note.subjective}</Text>
              </Box>
            )}
            {note.objective && (
              <Box>
                <Text size="sm" fw={600} c="cyan">
                  O: {t('visit_note.objective')}
                </Text>
                <Text size="sm">{note.objective}</Text>
              </Box>
            )}
            {note.assessmentDiagnoses.length > 0 && (
              <Box>
                <Text size="sm" fw={600} c="orange">
                  A: {t('visit_note.assessment')}
                </Text>
                <Group gap="xs" mt={4}>
                  {note.assessmentDiagnoses.map((dxId) => {
                    const d = diagnosisMap.get(dxId);
                    return (
                      <Badge key={dxId} variant="light" color="orange">
                        {d ? `${d.code} — ${i18n.language === 'ru' ? d.nameRu : d.nameUz}` : dxId}
                      </Badge>
                    );
                  })}
                </Group>
              </Box>
            )}
            {note.plan && (
              <Box>
                <Text size="sm" fw={600} c="green">
                  P: {t('visit_note.plan')}
                </Text>
                <Text size="sm">{note.plan}</Text>
              </Box>
            )}
            {note.freeNotes && (
              <Box>
                <Text size="sm" fw={600} c="dimmed">
                  {t('visit_note.free_notes')}
                </Text>
                <Text size="sm">{note.freeNotes}</Text>
              </Box>
            )}
          </Stack>
        </Card>
      ))}

      <Modal opened={opened} onClose={close} title={t('visit_note.create')} size="xl">
        <Stack gap="md">
          <Textarea
            label={`S: ${t('visit_note.subjective')}`}
            value={subjective}
            onChange={(e) => setSubjective(e.currentTarget.value)}
            rows={3}
          />
          <Textarea
            label={`O: ${t('visit_note.objective')}`}
            value={objective}
            onChange={(e) => setObjective(e.currentTarget.value)}
            rows={3}
          />
          <MultiSelect
            label={`A: ${t('visit_note.assessment')}`}
            placeholder={t('visit_note.diagnosis_picker')}
            searchable
            data={diagnosisOptions}
            value={selectedDiagnosisIds}
            onChange={setSelectedDiagnosisIds}
            limit={20}
          />
          <Textarea
            label={`P: ${t('visit_note.plan')}`}
            value={plan}
            onChange={(e) => setPlan(e.currentTarget.value)}
            rows={3}
          />
          <Textarea
            label={t('visit_note.free_notes')}
            value={freeNotes}
            onChange={(e) => setFreeNotes(e.currentTarget.value)}
            rows={2}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>
              {t('visit_note.save')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
