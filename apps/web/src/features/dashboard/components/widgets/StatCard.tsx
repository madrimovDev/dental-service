import { Card, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  color?: string;
}

/** KPI raqam + label + ixtiyoriy izoh. Og'ir grafik kutubxonasiz. */
export function StatCard({ label, value, hint, color }: StatCardProps) {
  return (
    <Card withBorder shadow="sm" padding="lg" radius="md">
      <Stack gap={4}>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        <Text fz={28} fw={700} c={color} lh={1.1}>
          {value}
        </Text>
        {hint != null && (
          <Text size="xs" c="dimmed">
            {hint}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
