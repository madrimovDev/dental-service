import { StateView } from '@dental/ui';
import { Image, Modal, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useAuthedObjectUrl } from '@/hooks/useAuthedObjectUrl';
import { useCashierTransactionPhoto } from '../cashier.api';

/**
 * FT-06.3 (D-4): to'lov rasmi (`cashier.photo.view`). Rasm `/uploads` Bearer bilan blob
 * (`useAuthedObjectUrl`); rasm olinmagan bo'lsa — sababi.
 */
export function TransactionPhotoModal({
  transactionId,
  onClose,
}: {
  transactionId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const photo = useCashierTransactionPhoto(transactionId);
  const img = useAuthedObjectUrl(photo.data?.url ?? null);

  const body = () => {
    if (photo.isLoading) return <StateView status="loading" skeleton="detail" />;
    if (photo.isError) {
      return (
        <StateView
          status="error"
          title={t('cashier.photo.load_error')}
          retryLabel={t('states.retry')}
          onRetry={() => photo.refetch()}
        />
      );
    }
    const p = photo.data;
    if (!p) return <StateView status="empty" title={t('cashier.photo.not_found')} />;
    if (!p.url) {
      return (
        <Text data-testid="cashier-photo-skipped">
          {t('cashier.photo.skipped', {
            reason: t(`cashier.photo.reason.${p.skippedReason ?? 'error'}`),
          })}
        </Text>
      );
    }
    if (img.isLoading) return <StateView status="loading" skeleton="detail" />;
    if (img.isError || !img.src) {
      return <StateView status="error" title={t('cashier.photo.load_error')} />;
    }
    return <Image src={img.src} alt={t('cashier.photo.alt')} radius="md" />;
  };

  return (
    <Modal
      opened={transactionId !== null}
      onClose={onClose}
      title={t('cashier.photo.view_title')}
      size="md"
      centered
    >
      {transactionId && body()}
    </Modal>
  );
}
