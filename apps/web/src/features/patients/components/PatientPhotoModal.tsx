import { CameraCapture, type CameraCaptureLabels } from '@dental/ui';
import { Modal } from '@mantine/core';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSetPatientPhoto } from '../patients.api';

/**
 * FT-06.2 — bemor avatari: kamera yoki fayl (`CameraCapture`) → `face_photo` yuklash →
 * `PATCH /patients/{id}/photo`. Xato — global MutationCache toast.
 */
export function PatientPhotoModal({
  opened,
  onClose,
  patientId,
}: {
  opened: boolean;
  onClose: () => void;
  patientId: string;
}) {
  const { t } = useTranslation();
  const setPhoto = useSetPatientPhoto(patientId);

  const labels = useMemo<CameraCaptureLabels>(
    () => ({
      capture: t('camera.capture'),
      retake: t('camera.retake'),
      use: t('camera.use'),
      switchCamera: t('camera.switch'),
      upload: t('camera.upload'),
      cancel: t('camera.cancel'),
      starting: t('camera.starting'),
      denied: t('camera.denied'),
      notFound: t('camera.not_found'),
      unsupported: t('camera.unsupported'),
      failed: t('camera.failed'),
      previewAlt: t('camera.preview_alt'),
      videoLabel: t('camera.video_label'),
    }),
    [t],
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('patientCard.photo_title')}
      size="md"
      centered
    >
      {/* Modal yopilganda unmount — kamera oqimi to'xtaydi. */}
      <CameraCapture
        labels={labels}
        onCancel={onClose}
        onCapture={(file) => setPhoto.mutate(file, { onSuccess: onClose })}
      />
    </Modal>
  );
}
