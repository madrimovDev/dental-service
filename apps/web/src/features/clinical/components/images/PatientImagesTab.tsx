import { StateView } from '@dental/ui';
import {
  Button,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPhotoPlus, IconPlus } from '@tabler/icons-react';
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

      {listQuery.isError ? (
        <StateView
          status="error"
          title={t('states.error_title')}
          retryLabel={t('states.retry')}
          onRetry={() => listQuery.refetch()}
        />
      ) : listQuery.isLoading ? (
        <StateView status="loading" skeleton="cards" />
      ) : vms.length === 0 ? (
        <StateView status="empty" title={t('image.empty')} />
      ) : (
        <SimpleGrid cols={{ base: 2, md: 3, lg: 4 }} spacing="md">
          {vms.map((vm) => (
            <ImageCard
              key={vm.id}
              vm={vm}
              canUpload={canUpload}
              onPreview={() => setPreviewId(vm.id)}
              onRequestDelete={() => setDeleteId(vm.id)}
            />
          ))}
          {canUpload && (
            <UnstyledButton
              onClick={openUpload}
              aria-label={t('image.upload')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                aspectRatio: '4 / 3',
                borderRadius: 14,
                border: '1.5px dashed var(--border-strong)',
                background: 'var(--surface-2)',
                color: 'var(--ink-3)',
                transition: 'border-color 120ms ease, color 120ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--primary)';
                e.currentTarget.style.color = 'var(--primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-strong)';
                e.currentTarget.style.color = 'var(--ink-3)';
              }}
            >
              <IconPlus size={24} />
              <Text size="xs" inherit>
                {t('image.upload')}
              </Text>
            </UnstyledButton>
          )}
        </SimpleGrid>
      )}

      <ImagePreviewModal image={previewImage} onClose={() => setPreviewId(null)} />
      <ImageUploadModal opened={uploadOpened} onClose={closeUpload} patientId={patientId} />

      {/* Delete tasdiqlash — Mantine modal (native dialog o'rniga) */}
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
