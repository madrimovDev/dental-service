import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function ConfirmModal({
  opened,
  onClose,
  onConfirm,
  message,
  title,
  confirmLabel,
  confirmColor = 'red',
  loading = false,
}: {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  message: ReactNode;
  title?: ReactNode;
  confirmLabel?: ReactNode;
  confirmColor?: string;
  loading?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Modal opened={opened} onClose={onClose} title={title ?? t('settings.confirm_title')}>
      <Stack gap="md">
        <Text size="sm">{message}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button color={confirmColor} onClick={onConfirm} loading={loading}>
            {confirmLabel ?? t('settings.confirm_ok')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
