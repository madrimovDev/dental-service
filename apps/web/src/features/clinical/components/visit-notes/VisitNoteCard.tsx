import type { Diagnosis, VisitNote } from '@dental/api-client';
import { Mono } from '@dental/ui';
import { ActionIcon, Badge, Box, Group, Image, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconCalendar, IconPencil } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { usePatientImages } from '../../clinical.api';
import { toVisitNoteVM } from '../../clinical.mappers';
import classes from './VisitNoteCard.module.css';

export function VisitNoteCard({
  note,
  diagnosisMap,
  onEdit,
}: {
  note: VisitNote;
  diagnosisMap: Map<string, Diagnosis>;
  // CLI-447: berilsa header'da tahrirlash tugmasi (medical_record.edit).
  onEdit?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const vm = toVisitNoteVM(note, diagnosisMap, i18n.language === 'ru' ? 'ru' : 'uz');
  const linkedImages = usePatientImages(note.patientId, note.id);
  const images = linkedImages.data ?? [];

  const soapCells = [
    { key: 'S', cls: classes.soapS, label: t('visit_note.subjective'), body: vm.subjective },
    { key: 'O', cls: classes.soapO, label: t('visit_note.objective'), body: vm.objective },
    {
      key: 'A',
      cls: classes.soapA,
      label: t('visit_note.assessment'),
      body: vm.diagnoses.length > 0 ? vm.diagnoses.join(', ') : null,
    },
    { key: 'P', cls: classes.soapP, label: t('visit_note.plan'), body: vm.plan },
  ];

  return (
    <div className={classes.card}>
      <Stack gap="md">
        <div className={classes.header}>
          <span className={classes.toothChip}>
            <IconCalendar size={18} />
          </span>
          <div className={classes.headMeta}>
            <Text className={classes.title}>{t('visit_note.title')}</Text>
            <Mono>{vm.visitDateText}</Mono>
          </div>
          {onEdit && (
            <ActionIcon
              variant="subtle"
              onClick={onEdit}
              ml="auto"
              aria-label={t('visit_note.edit')}
            >
              <IconPencil size={16} />
            </ActionIcon>
          )}
        </div>

        {vm.diagnoses.length > 0 && (
          <div className={classes.dxRow}>
            {vm.diagnoses.map((dx) => (
              <Badge key={dx} className={classes.dxChip} variant="transparent">
                {dx}
              </Badge>
            ))}
          </div>
        )}

        <div className={classes.soapGrid}>
          {soapCells.map((cell) => (
            <div key={cell.key} className={`${classes.soapCell} ${cell.cls}`}>
              <Group gap={6} mb={4} align="baseline">
                <Mono>
                  <span className={classes.soapLetter}>{cell.key}</span>
                </Mono>
                <span className={classes.soapLabel}>{cell.label}</span>
              </Group>
              {cell.body && <div className={classes.soapBody}>{cell.body}</div>}
            </div>
          ))}
        </div>

        {vm.freeNotes && (
          <Box>
            <Text size="sm" fw={600} c="dimmed">
              {t('visit_note.free_notes')}
            </Text>
            <Text size="sm">{vm.freeNotes}</Text>
          </Box>
        )}

        {images.length > 0 && (
          <Box>
            <Text size="sm" fw={600} c="dimmed">
              {t('visit_note.linked_images')}
            </Text>
            <SimpleGrid cols={4} mt={4} spacing="xs">
              {images.map((img) => (
                <a key={img.id} href={img.url} target="_blank" rel="noreferrer">
                  <Image
                    src={img.url}
                    alt={img.title ?? img.originalFilename}
                    h={72}
                    fit="cover"
                    radius="sm"
                  />
                </a>
              ))}
            </SimpleGrid>
          </Box>
        )}
      </Stack>
    </div>
  );
}
