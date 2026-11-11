import { Mono } from '@dental/ui';
import { Anchor, Badge, Group, Image, Modal, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { downloadAuthedFile, useAuthedObjectUrl } from '@/hooks/useAuthedObjectUrl';
import type { PatientImageVM } from '../../clinical.types';

export function ImagePreviewModal({
  image,
  onClose,
}: {
  image: PatientImageVM | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // P11: Bearer'li blob (faqat rasm turi uchun).
  const { src } = useAuthedObjectUrl(image?.isImage ? image.url : null);
  return (
    <Modal opened={!!image} onClose={onClose} title={image?.displayTitle} size="xl">
      {image && (
        <Stack>
          {image.isImage ? (
            <Image src={src ?? undefined} alt={image.displayTitle} fit="contain" />
          ) : (
            <Text>
              <Anchor
                component="button"
                type="button"
                onClick={() => {
                  downloadAuthedFile(image.url, image.originalFilename, {
                    openInNewTab: true,
                  }).catch(() => notifications.show({ color: 'red', message: t('common.error') }));
                }}
              >
                {image.originalFilename}
              </Anchor>
            </Text>
          )}
          {image.description && <Text>{image.description}</Text>}
          <Group gap="xs">
            <Badge>{t(image.typeLabelKey)}</Badge>
            <Mono>{image.sizeLabel}</Mono>
            <Mono>{new Date(image.createdAt).toLocaleString()}</Mono>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
