import { Mono } from '@dental/ui';
import { Badge, Group, Image, Modal, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { PatientImageVM } from '../../clinical.types';

export function ImagePreviewModal({
  image,
  onClose,
}: {
  image: PatientImageVM | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal opened={!!image} onClose={onClose} title={image?.displayTitle} size="xl">
      {image && (
        <Stack>
          {image.isImage ? (
            <Image src={image.url} alt={image.displayTitle} fit="contain" />
          ) : (
            <Text>
              <a href={image.url} target="_blank" rel="noopener noreferrer">
                {image.originalFilename}
              </a>
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
