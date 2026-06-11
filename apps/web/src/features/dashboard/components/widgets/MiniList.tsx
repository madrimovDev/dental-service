import { Card, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface MiniListItem {
  id: string;
  label: ReactNode;
  right?: ReactNode;
  to?: string;
}

export interface MiniListProps {
  title: string;
  items: MiniListItem[];
  emptyText: string;
}

/** Kichik ro'yxat kartasi — har element ixtiyoriy `to` link. */
export function MiniList({ title, items, emptyText }: MiniListProps) {
  return (
    <Card withBorder shadow="sm" padding="lg" radius="md">
      <Stack gap="sm">
        <Text fw={600}>{title}</Text>
        {items.length === 0 ? (
          <Text size="sm" c="dimmed">
            {emptyText}
          </Text>
        ) : (
          <Stack gap={6}>
            {items.map((item) => (
              <Group key={item.id} justify="space-between" wrap="nowrap" gap="sm">
                {item.to ? (
                  <Text component={Link} to={item.to} size="sm" c="teal" truncate>
                    {item.label}
                  </Text>
                ) : (
                  <Text size="sm" truncate>
                    {item.label}
                  </Text>
                )}
                {item.right != null && (
                  <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
                    {item.right}
                  </Text>
                )}
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
