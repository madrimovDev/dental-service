import type { ToothState, ToothStateEntry } from '@dental/api-client';
import { Box, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { STATE_BORDER, STATE_COLORS, ToothCell } from './ToothCell';

const PERMANENT_QUADRANTS = {
  upper_right: [18, 17, 16, 15, 14, 13, 12, 11],
  upper_left: [21, 22, 23, 24, 25, 26, 27, 28],
  lower_right: [48, 47, 46, 45, 44, 43, 42, 41],
  lower_left: [31, 32, 33, 34, 35, 36, 37, 38],
};

const PRIMARY_QUADRANTS = {
  upper_right: [55, 54, 53, 52, 51],
  upper_left: [61, 62, 63, 64, 65],
  lower_right: [85, 84, 83, 82, 81],
  lower_left: [71, 72, 73, 74, 75],
};

type Props = {
  states: ToothStateEntry[];
  isPrimaryDentition?: boolean;
  selectedTooth: number | null;
  onSelectTooth: (n: number) => void;
};

export function Odontogram({
  states,
  isPrimaryDentition = false,
  selectedTooth,
  onSelectTooth,
}: Props) {
  const { t } = useTranslation();
  const quadrants = isPrimaryDentition ? PRIMARY_QUADRANTS : PERMANENT_QUADRANTS;

  const toothStateMap = new Map<number, ToothState>();
  for (const s of states) {
    if (s.surface === 'whole') toothStateMap.set(s.toothNumber, s.state);
    else if (!toothStateMap.has(s.toothNumber)) toothStateMap.set(s.toothNumber, s.state);
  }

  const renderQuadrant = (teeth: number[]) => (
    <Group gap={4}>
      {teeth.map((n) => (
        <ToothCell
          key={n}
          number={n}
          state={toothStateMap.get(n) ?? 'healthy'}
          selected={selectedTooth === n}
          onClick={() => onSelectTooth(n)}
        />
      ))}
    </Group>
  );

  const divider = 'var(--mantine-color-teal-2)';

  return (
    <Stack gap="sm" align="center">
      <Group gap="lg" align="flex-end">
        <Stack gap={4} align="center">
          <Text size="xs" c="dimmed">
            {t('tooth_chart.upper_right')}
          </Text>
          {renderQuadrant(quadrants.upper_right)}
        </Stack>
        <Box style={{ width: 2, height: 60, backgroundColor: divider }} />
        <Stack gap={4} align="center">
          <Text size="xs" c="dimmed">
            {t('tooth_chart.upper_left')}
          </Text>
          {renderQuadrant(quadrants.upper_left)}
        </Stack>
      </Group>
      <Box style={{ height: 2, width: '90%', backgroundColor: divider }} />
      <Group gap="lg" align="flex-start">
        <Stack gap={4} align="center">
          {renderQuadrant(quadrants.lower_right)}
          <Text size="xs" c="dimmed">
            {t('tooth_chart.lower_right')}
          </Text>
        </Stack>
        <Box style={{ width: 2, height: 60, backgroundColor: divider }} />
        <Stack gap={4} align="center">
          {renderQuadrant(quadrants.lower_left)}
          <Text size="xs" c="dimmed">
            {t('tooth_chart.lower_left')}
          </Text>
        </Stack>
      </Group>

      <Group gap="xs" mt="md" wrap="wrap" justify="center">
        {(Object.keys(STATE_COLORS) as ToothState[]).map((s) => (
          <Group key={s} gap={4}>
            <Box
              style={{
                width: 16,
                height: 16,
                backgroundColor: STATE_COLORS[s],
                border: `1.5px solid ${STATE_BORDER[s]}`,
                borderRadius: 3,
              }}
            />
            <Text size="xs">{t(`tooth_chart.states.${s}`)}</Text>
          </Group>
        ))}
      </Group>
    </Stack>
  );
}
