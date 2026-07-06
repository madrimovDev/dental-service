import { Box, Group, Stack, Text } from '@mantine/core';
import { formatNumber } from '@/lib/format';

export type BarMiniDatum = {
  label: string;
  value: number;
  /** Ixtiyoriy per-seriya rang (masalan `var(--info)`); berilmasa `var(--primary)`. */
  color?: string;
};

/** Sof CSS bar — grafik kutubxonasiz (max'ga nisbatan width %). */
export function BarMini({ data }: { data: BarMiniDatum[] }) {
  const max = data.reduce((m, d) => Math.max(m, d.value), 0) || 1;
  return (
    <Stack gap={6}>
      {data.map((d) => (
        <Group key={d.label} gap="sm" wrap="nowrap">
          <Text size="sm" style={{ width: 140, flexShrink: 0, color: 'var(--text-2)' }} truncate>
            {d.label}
          </Text>
          <Box
            style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)' }}
          >
            <Box
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                height: 16,
                background: d.color ?? 'var(--primary)',
                borderRadius: 'var(--radius-sm)',
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
