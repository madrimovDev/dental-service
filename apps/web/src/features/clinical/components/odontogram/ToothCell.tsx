import type { ToothState } from '@dental/api-client';
import { Box, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';

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

export { STATE_BORDER, STATE_COLORS };

type Props = {
  number: number;
  state: ToothState;
  selected: boolean;
  onClick: () => void;
};

export function ToothCell({ number, state, selected, onClick }: Props) {
  const { t } = useTranslation();
  return (
    <Tooltip label={`${number} — ${t(`tooth_chart.states.${state}`)}`} withArrow>
      <Box
        onClick={onClick}
        style={{
          width: 36,
          height: 48,
          // teal chrome (Lock #6) — tanlangan halqa teal, holat rang saqlanadi
          border: selected
            ? '3px solid var(--mantine-color-teal-6)'
            : `2px solid ${STATE_BORDER[state]}`,
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
