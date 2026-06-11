import type { Diagnosis, VisitNote } from '@dental/api-client';
import { Mono } from '@dental/ui';
import { Badge, Box, Card, Group, Stack, Text } from '@mantine/core';
import { IconCalendar } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { toVisitNoteVM } from '../../clinical.mappers';

export function VisitNoteCard({
  note,
  diagnosisMap,
}: {
  note: VisitNote;
  diagnosisMap: Map<string, Diagnosis>;
}) {
  const { t, i18n } = useTranslation();
  const vm = toVisitNoteVM(note, diagnosisMap, i18n.language === 'ru' ? 'ru' : 'uz');
  return (
    <Card withBorder padding="md">
      <Stack gap="xs">
        <Group gap={6}>
          <IconCalendar size={16} />
          <Mono>{vm.visitDateText}</Mono>
        </Group>
        {vm.subjective && (
          <Box>
            <Text size="sm" fw={600}>
              S: {t('visit_note.subjective')}
            </Text>
            <Text size="sm">{vm.subjective}</Text>
          </Box>
        )}
        {vm.objective && (
          <Box>
            <Text size="sm" fw={600}>
              O: {t('visit_note.objective')}
            </Text>
            <Text size="sm">{vm.objective}</Text>
          </Box>
        )}
        {vm.diagnoses.length > 0 && (
          <Box>
            <Text size="sm" fw={600}>
              A: {t('visit_note.assessment')}
            </Text>
            <Group gap="xs" mt={4}>
              {vm.diagnoses.map((dx) => (
                <Badge key={dx} variant="light">
                  {dx}
                </Badge>
              ))}
            </Group>
          </Box>
        )}
        {vm.plan && (
          <Box>
            <Text size="sm" fw={600}>
              P: {t('visit_note.plan')}
            </Text>
            <Text size="sm">{vm.plan}</Text>
          </Box>
        )}
        {vm.freeNotes && (
          <Box>
            <Text size="sm" fw={600} c="dimmed">
              {t('visit_note.free_notes')}
            </Text>
            <Text size="sm">{vm.freeNotes}</Text>
          </Box>
        )}
      </Stack>
    </Card>
  );
}
