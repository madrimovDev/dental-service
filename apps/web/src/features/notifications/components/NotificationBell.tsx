import {
  ActionIcon,
  Button,
  Group,
  Indicator,
  Popover,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMarkAllRead, useMarkRead, useNotifications } from '../notifications.api.ts';
import type { Notification } from '../notifications.types.ts';
import classes from './NotificationBell.module.css';

const TZ = 'Asia/Tashkent';

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'uz-UZ', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function NotificationRow({
  item,
  locale,
  onRead,
}: {
  item: Notification;
  locale: string;
  onRead: (id: string) => void;
}) {
  const unread = item.readAt === null;
  return (
    <UnstyledButton
      className={classes.row}
      data-unread={unread || undefined}
      onClick={() => unread && onRead(item.id)}
    >
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm" fw={unread ? 600 : 400} lineClamp={1}>
          {item.title}
        </Text>
        {unread && <span className={classes.unreadDot} />}
      </Group>
      {item.body && (
        <Text size="xs" c="dimmed" lineClamp={2}>
          {item.body}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        {formatDate(item.createdAt, locale)}
      </Text>
    </UnstyledButton>
  );
}

export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const [opened, { toggle, close }] = useDisclosure(false);
  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const items = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <Popover
      opened={opened}
      onChange={(o) => (o ? undefined : close())}
      width={340}
      position="bottom-end"
      shadow="md"
      withinPortal
    >
      <Popover.Target>
        <Indicator
          disabled={unreadCount === 0}
          label={unreadCount > 99 ? '99+' : unreadCount}
          size={16}
          color="red"
          offset={4}
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            aria-label={t('shell.notifications')}
            onClick={toggle}
          >
            <Bell size={20} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>

      <Popover.Dropdown p={0}>
        <Group justify="space-between" px="md" py="sm" className={classes.header}>
          <Text fw={600} size="sm">
            {t('notifications.title')}
          </Text>
          {unreadCount > 0 && (
            <Button
              variant="subtle"
              size="compact-xs"
              onClick={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
            >
              {t('notifications.mark_all_read')}
            </Button>
          )}
        </Group>

        <ScrollArea.Autosize mah={360} type="auto">
          {isLoading ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              {t('common.loading')}
            </Text>
          ) : items.length === 0 ? (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              {t('notifications.empty')}
            </Text>
          ) : (
            <Stack gap={0}>
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  locale={i18n.language}
                  onRead={(id) => markRead.mutate(id)}
                />
              ))}
            </Stack>
          )}
        </ScrollArea.Autosize>
      </Popover.Dropdown>
    </Popover>
  );
}
