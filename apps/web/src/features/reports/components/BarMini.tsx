import { Box, Group, Stack, Text } from '@mantine/core';
import { formatNumber } from '@/lib/format';

export type BarMiniDatum = { label: string; value: number };

/** Sof CSS bar — grafik kutubxonasiz (max'ga nisbatan width %). */
export function BarMini({ data }: { data: BarMiniDatum[] }) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  return (
    <Stack gap={6}>
      {data.map((d) => (
        <Group key={d.label} gap="sm" wrap="nowrap">
          <Text size="sm" style={{ width: 140, flexShrink: 0 }} truncate>
            {d.label}
          </Text>
          <Box style={{ flex: 1, background: 'var(--mantine-color-gray-1)', borderRadius: 4 }}>
            <Box
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                height: 16,
                background: 'var(--mantine-color-blue-5)',
                borderRadius: 4,
              }}
            />
          </Box>
          <Text size="sm" style={{ width: 90, flexShrink: 0, textAlign: 'right' }}>
            {formatNumber(d.value)}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}
