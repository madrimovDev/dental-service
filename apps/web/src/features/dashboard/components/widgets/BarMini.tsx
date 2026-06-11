import { Box, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export interface BarMiniDatum {
  label: string;
  value: number;
  display?: ReactNode;
}

export interface BarMiniProps {
  data: BarMiniDatum[];
  color?: string;
}

/** Sof CSS bar chart — max qiymatga nisbatan width%. Grafik dep yo'q. */
export function BarMini({ data, color = 'var(--mantine-color-teal-6)' }: BarMiniProps) {
  const max = Math.max(0, ...data.map((d) => d.value));
  return (
    <Stack gap={8}>
      {data.map((d) => {
        const pct = max > 0 ? Math.round((d.value / max) * 100) : 0;
        return (
          <Stack key={d.label} gap={2}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="xs" truncate>
                {d.label}
              </Text>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {d.display ?? d.value}
              </Text>
            </Group>
            <Box
              style={{
                height: 8,
                borderRadius: 4,
                backgroundColor: 'var(--mantine-color-gray-2)',
                overflow: 'hidden',
              }}
            >
              <Box
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  backgroundColor: color,
                  transition: 'width 200ms ease',
                }}
              />
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
}
