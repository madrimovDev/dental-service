import type { PatientImageType } from '@dental/api-client';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  FileInput,
  Group,
  Image,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDownload, IconPhotoPlus, IconTrash, IconZoomIn } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api.ts';
import { useAuthStore } from '@/stores/auth-store.ts';

type Props = { patientId: string };

const TYPE_OPTIONS: PatientImageType[] = [
  'xray_panoramic',
  'xray_periapical',
  'xray_bitewing',
  'xray_cbct',
  'intraoral_photo',
  'face_photo',
  'before_after',
  'other',
];

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export function PatientImagesTab({ patientId }: Props) {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const qc = useQueryClient();
  const [opened, { open, close }] = useDisclosure(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<PatientImageType>('intraoral_photo');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [toothNumbers, setToothNumbers] = useState('');
  const [takenDate, setTakenDate] = useState('');

  const listQuery = useQuery({
    queryKey: ['patient-images', patientId],
    queryFn: () => api.patientImages.list(patientId),
  });

  const uploadMut = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file');
      const form = new FormData();
      form.append('file', file);
      form.append('patientId', patientId);
      form.append('type', type);
      if (title) form.append('title', title);
      if (description) form.append('description', description);
      if (toothNumbers) form.append('toothNumbers', toothNumbers);
      if (takenDate) form.append('takenDate', new Date(takenDate).toISOString());
      return api.patientImages.upload(form);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-images', patientId] });
      setFile(null);
      setTitle('');
      setDescription('');
      setToothNumbers('');
      setTakenDate('');
      close();
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => api.patientImages.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patient-images', patientId] }),
  });

  const canUpload = hasPermission('patient_image.upload');
  const canView = hasPermission('patient_image.view');

  if (!canView) return <Text c="dimmed">{t('patients.no_medical_permission')}</Text>;

  const previewImage = listQuery.data?.find((i) => i.id === previewId) ?? null;

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>{t('image.title')}</Title>
        {canUpload && (
          <Button leftSection={<IconPhotoPlus size={16} />} onClick={open}>
            {t('image.upload')}
          </Button>
        )}
      </Group>

      {listQuery.isLoading && <Text>{t('common.loading')}</Text>}
      {!listQuery.isLoading && listQuery.data?.length === 0 && (
        <Paper withBorder p="md">
          <Text c="dimmed">{t('image.empty')}</Text>
        </Paper>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing="md">
        {listQuery.data?.map((img) => (
          <Card key={img.id} withBorder padding="sm">
            <Card.Section>
              <Box
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  aspectRatio: '1 / 1',
                  overflow: 'hidden',
                  background: '#f1f3f5',
                }}
                onClick={() => setPreviewId(img.id)}
              >
                {img.contentType.startsWith('image/') ? (
                  <Image
                    src={img.url}
                    alt={img.title ?? img.originalFilename}
                    height="100%"
                    fit="cover"
                  />
                ) : (
                  <Stack align="center" justify="center" h="100%">
                    <Text c="dimmed">📄</Text>
                    <Text size="xs" c="dimmed">
                      {img.contentType}
                    </Text>
                  </Stack>
                )}
                <ActionIcon
                  variant="filled"
                  color="dark"
                  style={{ position: 'absolute', top: 8, right: 8, opacity: 0.7 }}
                >
                  <IconZoomIn size={16} />
                </ActionIcon>
              </Box>
            </Card.Section>
            <Stack gap={4} mt="xs">
              <Group justify="space-between">
                <Badge size="sm" variant="light">
                  {t(`image.type_${img.type}`)}
                </Badge>
                <Text size="xs" c="dimmed">
                  {formatBytes(img.sizeBytes)}
                </Text>
              </Group>
              <Text size="sm" fw={500} truncate>
                {img.title ?? img.originalFilename}
              </Text>
              {img.toothNumbers && img.toothNumbers.length > 0 && (
                <Text size="xs" c="dimmed">
                  🦷 {img.toothNumbers.join(', ')}
                </Text>
              )}
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="subtle"
                  component="a"
                  href={img.url}
                  target="_blank"
                  leftSection={<IconDownload size={12} />}
                >
                  {t('image.upload')}
                </Button>
                {canUpload && (
                  <ActionIcon
                    color="red"
                    variant="subtle"
                    size="sm"
                    onClick={() => {
                      if (confirm(t('image.confirm_delete'))) removeMut.mutate(img.id);
                    }}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                )}
              </Group>
            </Stack>
          </Card>
        ))}
      </SimpleGrid>

      {/* Preview modal */}
      <Modal
        opened={!!previewId}
        onClose={() => setPreviewId(null)}
        title={previewImage?.title ?? previewImage?.originalFilename}
        size="xl"
      >
        {previewImage && (
          <Stack>
            {previewImage.contentType.startsWith('image/') ? (
              <Image src={previewImage.url} alt={previewImage.title ?? ''} fit="contain" />
            ) : (
              <Text>
                <a href={previewImage.url} target="_blank" rel="noopener noreferrer">
                  {previewImage.originalFilename}
                </a>
              </Text>
            )}
            {previewImage.description && <Text>{previewImage.description}</Text>}
            <Group gap="xs">
              <Badge>{t(`image.type_${previewImage.type}`)}</Badge>
              <Text size="sm" c="dimmed">
                {formatBytes(previewImage.sizeBytes)}
              </Text>
              <Text size="sm" c="dimmed">
                {new Date(previewImage.createdAt).toLocaleString()}
              </Text>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Upload modal */}
      <Modal opened={opened} onClose={close} title={t('image.upload')} size="lg">
        <Stack gap="md">
          <FileInput
            label={t('image.select_file')}
            placeholder={t('image.drop_zone')}
            description={`${t('image.max_size')} · ${t('image.supported_formats')}`}
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/dicom"
            value={file}
            onChange={setFile}
          />
          <Select
            label={t('image.type')}
            data={TYPE_OPTIONS.map((tp) => ({ value: tp, label: t(`image.type_${tp}`) }))}
            value={type}
            onChange={(v) => v && setType(v as PatientImageType)}
          />
          <TextInput
            label={t('image.image_title')}
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <Textarea
            label={t('image.description')}
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
            rows={2}
          />
          <Group grow>
            <TextInput
              label={t('image.tooth_numbers')}
              placeholder="11, 12"
              value={toothNumbers}
              onChange={(e) => setToothNumbers(e.currentTarget.value)}
            />
            <TextInput
              label={t('image.taken_date')}
              type="date"
              value={takenDate}
              onChange={(e) => setTakenDate(e.currentTarget.value)}
            />
          </Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => uploadMut.mutate()}
              loading={uploadMut.isPending}
              disabled={!file}
            >
              {uploadMut.isPending ? t('image.uploading') : t('image.upload')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
