import type { ToothState, ToothStateEntry } from '@dental/api-client';
import { Box, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { STATUS, statusFill, ToothCell } from './ToothCell';

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

// Barcha enum holatlar legend tartibi (10 entry — to'liq).
const LEGEND_ORDER: ToothState[] = [
  'healthy',
  'caries',
  'filling',
  'crown',
  'root_canal',
  'implant',
  'missing',
  'to_extract',
  'temporary',
  'veneer',
];

const ARCH_AMP = 26; // px — yoy amplitudasi (uchlar markazdan shu qadar siljiydi)
const MIDLINE_GAP = 14; // px — 11→21 orasidagi bo'shliq

const rowLabelStyle = {
  fontSize: 10.5,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'var(--ink-3)',
  fontWeight: 600,
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

  // Bir yoy: [o'ng-yarim ...11, 21... chap-yarim]. Markaz = right/left chegarasi.
  // Vertikal offset = amp*t*t (parabola): markaz tishlari tekis, uchlar siljiydi.
  // arch='upper' → uchlar yuqoriga (offset manfiy), 'lower' → pastga.
  const renderArch = (right: number[], left: number[], arch: 'upper' | 'lower') => {
    const all = [...right, ...left];
    const half = right.length; // midline = half va half-1 orasida
    const span = half - 0.5; // markazdan eng chetgacha pozitsiya
    return (
      <Box style={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        {all.map((n, i) => {
          const dist = i - (half - 0.5); // markazdan masofa
          const tNorm = dist / span; // -1..1
          const offset = ARCH_AMP * tNorm * tNorm;
          const ty = arch === 'upper' ? -offset : offset;
          const isMidlineGap = i === half; // 11→21 (yoki sut) orasi
          return (
            <Box
              key={n}
              style={{
                transform: `translateY(${ty}px)`,
                marginLeft: isMidlineGap ? MIDLINE_GAP : undefined,
              }}
            >
              <ToothCell
                number={n}
                state={toothStateMap.get(n) ?? 'healthy'}
                selected={selectedTooth === n}
                onClick={() => onSelectTooth(n)}
              />
            </Box>
          );
        })}
      </Box>
    );
  };

  return (
    <Stack gap="lg" align="center">
      <Stack gap={6} align="center">
        <Text style={rowLabelStyle}>
          {t('tooth_chart.upper_right')} · {t('tooth_chart.upper_left')}
        </Text>
        {renderArch(quadrants.upper_right, quadrants.upper_left, 'upper')}
      </Stack>

      <Box style={{ height: 1, width: '88%', background: 'var(--border)' }} />

      <Stack gap={6} align="center">
        {renderArch(quadrants.lower_right, quadrants.lower_left, 'lower')}
        <Text style={rowLabelStyle}>
          {t('tooth_chart.lower_right')} · {t('tooth_chart.lower_left')}
        </Text>
      </Stack>

      <Group gap="md" mt="xs" wrap="wrap" justify="center">
        {LEGEND_ORDER.map((s) => (
          <Group key={s} gap={6} wrap="nowrap">
            <Box
              style={{
                position: 'relative',
                width: 11,
                height: 11,
                borderRadius: 3,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: statusFill(s),
                border:
                  STATUS[s].fill === 'empty'
                    ? '1.5px solid var(--border-strong)'
                    : '1px solid var(--border)',
              }}
            >
              {STATUS[s].mark === 'x' && (
                <Text
                  span
                  style={{ fontSize: 9, lineHeight: 1, color: 'var(--ink-3)', fontWeight: 700 }}
                >
                  ✕
                </Text>
              )}
              {STATUS[s].mark === 'extract' && (
                <Text
                  span
                  style={{
                    fontSize: 9,
                    lineHeight: 1,
                    color: 'var(--text-on-danger)',
                    fontWeight: 700,
                  }}
                >
                  ✕
                </Text>
              )}
            </Box>
            <Text style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>
              {t(`tooth_chart.states.${s}`)}
            </Text>
          </Group>
        ))}
      </Group>
    </Stack>
  );
}
