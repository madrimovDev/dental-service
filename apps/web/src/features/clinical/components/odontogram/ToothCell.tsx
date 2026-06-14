import type { ToothState } from '@dental/api-client';
import { Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import classes from './ToothCell.module.css';

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
  const stateLabel = t(`tooth_chart.states.${state}`);
  return (
    <Tooltip label={`${number} — ${stateLabel}`} withArrow>
      <UnstyledButton
        type="button"
        onClick={onClick}
        className={classes.cell}
        // Holat faqat rang bilan emas — aria-label'da raqam + holat nomi (WCAG 1.4.1)
        aria-label={`${number} — ${stateLabel}`}
        aria-pressed={selected}
        style={{
          // teal chrome (Lock #6) — tanlangan halqa teal, holat rang saqlanadi
          border: selected
            ? '3px solid var(--mantine-color-teal-6)'
            : `2px solid ${STATE_BORDER[state]}`,
          backgroundColor: STATE_COLORS[state],
        }}
      >
        <Text size="xs" fw={700} c={state === 'missing' ? 'white' : 'dark'}>
          {number}
        </Text>
      </UnstyledButton>
    </Tooltip>
  );
}
