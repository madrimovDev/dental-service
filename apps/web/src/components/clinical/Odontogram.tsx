import type { ToothState, ToothStateEntry } from '@dental/api-client';
import { Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';

// FDI numbering — permanent dentition (32 teeth)
// Quadrants: 1=upper right, 2=upper left, 3=lower left, 4=lower right
const PERMANENT_QUADRANTS = {
  upper_right: [18, 17, 16, 15, 14, 13, 12, 11],
  upper_left: [21, 22, 23, 24, 25, 26, 27, 28],
  lower_right: [48, 47, 46, 45, 44, 43, 42, 41],
  lower_left: [31, 32, 33, 34, 35, 36, 37, 38],
};

// Primary (deciduous) — 20 teeth
const PRIMARY_QUADRANTS = {
  upper_right: [55, 54, 53, 52, 51],
  upper_left: [61, 62, 63, 64, 65],
  lower_right: [85, 84, 83, 82, 81],
  lower_left: [71, 72, 73, 74, 75],
};

const STATE_COLORS: Record<ToothState, string> = {
  healthy: '#e8f5e9',
  caries: '#ffeb3b',
  filling: '#90caf9',
  crown: '#bcaaa4',
  implant: '#9e9e9e',
  missing: '#212121',
  root_canal: '#ef9a9a',
  to_extract: '#ff5252',
  temporary: '#fff59d',
  veneer: '#ce93d8',
};

const STATE_BORDER: Record<ToothState, string> = {
  healthy: '#a5d6a7',
  caries: '#fbc02d',
  filling: '#1976d2',
  crown: '#795548',
  implant: '#616161',
  missing: '#000000',
  root_canal: '#c62828',
  to_extract: '#b71c1c',
  temporary: '#f57f17',
  veneer: '#7b1fa2',
};

type ToothProps = {
  number: number;
  state: ToothState;
  selected: boolean;
  onClick: () => void;
};

function Tooth({ number, state, selected, onClick }: ToothProps) {
  const { t } = useTranslation();
  return (
    <Tooltip label={`${number} — ${t(`tooth_chart.states.${state}`)}`} withArrow>
      <Box
        onClick={onClick}
        style={{
          width: 36,
          height: 48,
          border: selected ? '3px solid #228be6' : `2px solid ${STATE_BORDER[state]}`,
          backgroundColor: STATE_COLORS[state],
          borderRadius: '6px 6px 12px 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          cursor: 'pointer',
          userSelect: 'none',
          padding: 2,
          transition: 'transform 0.1s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <Text size="xs" fw={700} c={state === 'missing' ? 'white' : 'dark'}>
          {number}
        </Text>
      </Box>
    </Tooltip>
  );
}

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
        <Tooth
          key={n}
          number={n}
          state={toothStateMap.get(n) ?? 'healthy'}
          selected={selectedTooth === n}
          onClick={() => onSelectTooth(n)}
        />
      ))}
    </Group>
  );

  return (
    <Stack gap="sm" align="center">
      <Group gap="lg" align="flex-end">
        <Stack gap={4} align="center">
          <Text size="xs" c="dimmed">
            {t('tooth_chart.upper_right')}
          </Text>
          {renderQuadrant(quadrants.upper_right)}
        </Stack>
        <Box style={{ width: 2, height: 60, backgroundColor: '#dee2e6' }} />
        <Stack gap={4} align="center">
          <Text size="xs" c="dimmed">
            {t('tooth_chart.upper_left')}
          </Text>
          {renderQuadrant(quadrants.upper_left)}
        </Stack>
      </Group>
      <Box style={{ height: 2, width: '90%', backgroundColor: '#dee2e6' }} />
      <Group gap="lg" align="flex-start">
        <Stack gap={4} align="center">
          {renderQuadrant(quadrants.lower_right)}
          <Text size="xs" c="dimmed">
            {t('tooth_chart.lower_right')}
          </Text>
        </Stack>
        <Box style={{ width: 2, height: 60, backgroundColor: '#dee2e6' }} />
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
