import { Mono } from '@dental/ui';
import { ActionIcon, Badge, Box, Button, Card, Group, Image, Stack, Text } from '@mantine/core';
import {
  IconDental,
  IconDownload,
  IconFile,
  IconPhoto,
  IconTrash,
  IconZoomIn,
} from '@tabler/icons-react';
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
    <Card
      withBorder
      padding="sm"
      radius={14}
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <Card.Section>
        <Box
          role="button"
          tabIndex={0}
          aria-label={t('image.zoom')}
          style={{
            position: 'relative',
            cursor: 'pointer',
            aspectRatio: '4 / 3',
            overflow: 'hidden',
            background: 'var(--surface-2)',
          }}
          onClick={onPreview}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onPreview();
            }
          }}
        >
          {vm.isImage ? (
            <Image src={vm.url} alt={vm.displayTitle} height="100%" fit="cover" />
          ) : (
            <Stack align="center" justify="center" h="100%" gap={6}>
              <IconFile size={32} style={{ color: 'var(--ink-3)' }} />
              <Text fz={12} c="dimmed">
                {vm.contentType}
              </Text>
            </Stack>
          )}
          {vm.isImage && (
            <IconPhoto
              size={14}
              aria-hidden
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                color: 'var(--on-primary)',
                opacity: 0.85,
              }}
            />
          )}
          <ActionIcon
            component="div"
            variant="filled"
            color="dark"
            aria-hidden
            tabIndex={-1}
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
        <Text fz={12} fw={500} truncate style={{ color: 'var(--ink)' }}>
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
            rel="noopener noreferrer"
            download={vm.originalFilename}
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
