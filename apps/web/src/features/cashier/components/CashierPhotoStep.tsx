import { CameraCapture, type CameraCaptureLabels, type CameraUnavailableReason } from '@dental/ui';
import { Modal, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type CashierPhotoSkipReason, useUploadCashierPhoto } from '../cashier.api';

const REASON_MAP: Record<CameraUnavailableReason, CashierPhotoSkipReason> = {
  denied: 'permission_denied',
  not_found: 'no_camera',
  unsupported: 'no_camera',
  failed: 'error',
};

export interface CashierPhotoStepProps {
  /** Saqlangan to'lov id'si; `null` — qadam yopiq. */
  transactionId: string | null;
  /** Qadam tugadi (rasm yuborildi / o'tkazib yuborildi / kamera yo'q). */
  onDone: () => void;
}

/**
 * FT-06.3 (D-4): to'lovdan KEYIN to'lovchining yuz rasmi. To'lov allaqachon saqlangan —
 * bu qadam uni bloklamaydi va qaytarmaydi: yuborish xatosi faqat toast, modal baribir yopiladi.
 * Kamera ochilmasa (ruxsat yo'q / qurilma yo'q) sabab avtomatik `skippedReason` sifatida yoziladi.
 */
export function CashierPhotoStep({ transactionId, onDone }: CashierPhotoStepProps) {
  const { t } = useTranslation();
  const upload = useUploadCashierPhoto();
  // Bitta to'lovga bitta yozuv (server 409 beradi) — ikkinchi yuborish oldini olinadi.
  const sentFor = useRef<string | null>(null);

  useEffect(() => {
    if (transactionId === null) sentFor.current = null;
  }, [transactionId]);

  const labels = useMemo<CameraCaptureLabels>(
    () => ({
      capture: t('camera.capture'),
      retake: t('camera.retake'),
      use: t('camera.use'),
      switchCamera: t('camera.switch'),
      upload: t('camera.upload'),
      cancel: t('cashier.photo.skip'),
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

  const send = (payload: { file?: File; skippedReason?: CashierPhotoSkipReason }) => {
    if (!transactionId || sentFor.current === transactionId) return;
    sentFor.current = transactionId;
    upload.mutate(
      { transactionId, ...payload },
      {
        onSuccess: () => {
          if (payload.file)
            notifications.show({ color: 'teal', message: t('cashier.photo.saved') });
        },
      },
    );
    onDone();
  };

  const skip = () => send({ skippedReason: 'user_skipped' });

  return (
    <Modal
      opened={transactionId !== null}
      onClose={skip}
      title={t('cashier.photo.title')}
      size="md"
      centered
    >
      <Text size="sm" c="dimmed" mb="sm">
        {t('cashier.photo.hint')}
      </Text>
      {/* Modal yopilganda unmount — kamera oqimi to'xtaydi. */}
      {transactionId && (
        <CameraCapture
          key={transactionId}
          labels={labels}
          onCancel={skip}
          onCapture={(file) => send({ file })}
          onUnavailable={(reason) => {
            notifications.show({ color: 'yellow', message: t('cashier.photo.unavailable') });
            send({ skippedReason: REASON_MAP[reason] });
          }}
        />
      )}
    </Modal>
  );
}
