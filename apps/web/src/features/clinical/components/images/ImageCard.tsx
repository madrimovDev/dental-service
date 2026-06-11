import { Mono } from '@dental/ui';
import { ActionIcon, Badge, Box, Button, Card, Group, Image, Stack, Text } from '@mantine/core';
import { IconDental, IconDownload, IconFile, IconTrash, IconZoomIn } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { PatientImageVM } from '../../clinical.types';

export function ImageCard({
  vm,
  canUpload,
  onPreview,
  onRequestDelete,
}: {
  vm: PatientImageVM;
  canUpload: boolean;
  onPreview: () => void;
  onRequestDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card withBorder padding="sm">
      <Card.Section>
        <Box
          style={{
            position: 'relative',
            cursor: 'pointer',
            aspectRatio: '1 / 1',
            overflow: 'hidden',
            background: 'var(--mantine-color-gray-1)',
          }}
          onClick={onPreview}
        >
          {vm.isImage ? (
            <Image src={vm.url} alt={vm.displayTitle} height="100%" fit="cover" />
          ) : (
            <Stack align="center" justify="center" h="100%">
              <IconFile size={32} />
              <Text size="xs" c="dimmed">
                {vm.contentType}
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
            {t(vm.typeLabelKey)}
          </Badge>
          <Mono>{vm.sizeLabel}</Mono>
        </Group>
        <Text size="sm" fw={500} truncate>
          {vm.displayTitle}
        </Text>
        {vm.toothNumbers.length > 0 && (
          <Group gap={4}>
            <IconDental size={14} />
            <Text size="xs" c="dimmed">
              {vm.toothNumbers.join(', ')}
            </Text>
          </Group>
        )}
        <Group gap="xs">
          <Button
            size="xs"
            variant="subtle"
            component="a"
            href={vm.url}
            target="_blank"
            leftSection={<IconDownload size={12} />}
          >
            {t('image.download')}
          </Button>
          {canUpload && (
            <ActionIcon
              color="red"
              variant="subtle"
              size="sm"
              onClick={onRequestDelete}
              aria-label={t('common.delete')}
            >
              <IconTrash size={14} />
            </ActionIcon>
          )}
        </Group>
      </Stack>
    </Card>
  );
}
