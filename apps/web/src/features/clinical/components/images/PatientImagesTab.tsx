import { Button, Group, Modal, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPhotoPlus } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store.ts';
import { useDeletePatientImage, usePatientImages } from '../../clinical.api';
import { toPatientImageVM } from '../../clinical.mappers';
import type { PatientImageVM } from '../../clinical.types';
import { ImageCard } from './ImageCard';
import { ImagePreviewModal } from './ImagePreviewModal';
import { ImageUploadModal } from './ImageUploadModal';

type Props = { patientId: string };

export function PatientImagesTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const [uploadOpened, { open: openUpload, close: closeUpload }] = useDisclosure(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canUpload = hasPermission('patient_image.upload');
  const canView = hasPermission('patient_image.view');

  const listQuery = usePatientImages(patientId);
  const deleteMut = useDeletePatientImage(patientId);

  const vms: PatientImageVM[] = useMemo(
    () => (listQuery.data ?? []).map(toPatientImageVM),
    [listQuery.data],
  );

  if (!canView) return <Text c="dimmed">{t('patients.no_medical_permission')}</Text>;

  const previewImage = vms.find((v) => v.id === previewId) ?? null;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('image.title')}</Title>
        {canUpload && (
          <Button leftSection={<IconPhotoPlus size={16} />} onClick={openUpload}>
            {t('image.upload')}
          </Button>
        )}
      </Group>

      {listQuery.isLoading && <Text>{t('common.loading')}</Text>}
      {!listQuery.isLoading && vms.length === 0 && (
        <Paper withBorder p="md">
          <Text c="dimmed">{t('image.empty')}</Text>
        </Paper>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
        {vms.map((vm) => (
          <ImageCard
            key={vm.id}
            vm={vm}
            canUpload={canUpload}
            onPreview={() => setPreviewId(vm.id)}
            onRequestDelete={() => setDeleteId(vm.id)}
          />
        ))}
      </SimpleGrid>

      <ImagePreviewModal image={previewImage} onClose={() => setPreviewId(null)} />
      <ImageUploadModal opened={uploadOpened} onClose={closeUpload} patientId={patientId} />

      {/* Delete confirm — Mantine modal (native confirm() o'rniga) */}
      <Modal
        opened={!!deleteId}
        onClose={() => setDeleteId(null)}
        title={t('image.confirm_delete')}
        size="sm"
      >
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeleteId(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            color="red"
            loading={deleteMut.isPending}
            onClick={() => {
              if (deleteId) deleteMut.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
            }}
          >
            {t('common.delete')}
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
