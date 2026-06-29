import { Group, Stack, Text } from '@mantine/core';
import type { CSSProperties, ReactNode } from 'react';
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

const cardStyle: CSSProperties = {
  borderRadius: 'var(--radius-card)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  boxShadow: 'var(--shadow-sm)',
  padding: 16,
};

/** Kichik ro'yxat kartasi — har element ixtiyoriy `to` link. */
export function MiniList({ title, items, emptyText }: MiniListProps) {
  return (
    <div style={cardStyle}>
      <Stack gap="sm">
        <Text fw={600} c="var(--ink)">
          {title}
        </Text>
        {items.length === 0 ? (
          <Text size="sm" c="var(--ink-3)">
            {emptyText}
          </Text>
        ) : (
          <Stack gap={6}>
            {items.map((item) => (
              <Group key={item.id} justify="space-between" wrap="nowrap" gap="sm">
                {item.to ? (
                  <Text component={Link} to={item.to} size="sm" c="var(--primary)" truncate>
                    {item.label}
                  </Text>
                ) : (
                  <Text size="sm" c="var(--ink)" truncate>
                    {item.label}
                  </Text>
                )}
                {item.right != null && (
                  <Text size="sm" c="var(--ink-3)" style={{ flexShrink: 0 }}>
                    {item.right}
                  </Text>
                )}
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </div>
  );
}
