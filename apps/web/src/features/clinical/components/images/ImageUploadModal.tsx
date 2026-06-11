import type { PatientImageType } from '@dental/api-client';
import { Button, FileInput, Group, Modal, Select, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver } from 'mantine-form-zod-resolver';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUploadPatientImage } from '../../clinical.api';
import { type UploadImageFormValues, uploadImageFormSchema } from '../../clinical.schema';

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

export function ImageUploadModal({
  opened,
  onClose,
  patientId,
}: {
  opened: boolean;
  onClose: () => void;
  patientId: string;
}) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const uploadMut = useUploadPatientImage(patientId);
  const form = useForm<UploadImageFormValues>({
    initialValues: {
      type: 'intraoral_photo',
      title: '',
      description: '',
      toothNumbersText: '',
      takenDate: '',
    },
    validate: zod4Resolver(uploadImageFormSchema),
  });

  const handleClose = () => {
    form.reset();
    setFile(null);
    onClose();
  };

  const submit = form.onSubmit((values) => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('patientId', patientId);
    fd.append('type', values.type);
    if (values.title) fd.append('title', values.title);
    if (values.description) fd.append('description', values.description);
    if (values.toothNumbersText) fd.append('toothNumbers', values.toothNumbersText);
    if (values.takenDate) fd.append('takenDate', new Date(values.takenDate).toISOString());
    uploadMut.mutate(fd, { onSuccess: handleClose });
  });

  return (
    <Modal opened={opened} onClose={handleClose} title={t('image.upload')} size="lg">
      <form onSubmit={submit}>
        <Stack gap="md">
          <FileInput
            label={t('image.select_file')}
            placeholder={t('image.drop_zone')}
            description={`${t('image.max_size')} · ${t('image.supported_formats')}`}
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/dicom"
            value={file}
            onChange={setFile}
            required
          />
          <Select
            label={t('image.type')}
            data={TYPE_OPTIONS.map((tp) => ({ value: tp, label: t(`image.type_${tp}`) }))}
            {...form.getInputProps('type')}
          />
          <TextInput label={t('image.image_title')} {...form.getInputProps('title')} />
          <Textarea
            label={t('image.description')}
            rows={2}
            {...form.getInputProps('description')}
          />
          <Group grow>
            <TextInput
              label={t('image.tooth_numbers')}
              placeholder="11, 12"
              {...form.getInputProps('toothNumbersText')}
            />
            <TextInput
              label={t('image.taken_date')}
              type="date"
              {...form.getInputProps('takenDate')}
            />
          </Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={uploadMut.isPending} disabled={!file}>
              {uploadMut.isPending ? t('image.uploading') : t('image.upload')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
