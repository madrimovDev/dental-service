import type { ToothState, ToothSurface } from '@dental/api-client';
import { UnstyledButton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import classes from './ToothCell.module.css';

/**
 * Status → Dental OS token map (DS3 spec §4.2).
 * `token` — CSS custom-property nomi (var() bilan o'raladi).
 * `fill` — yuza/swatch foni qanday chiziladi:
 *   - 'fill'  → to'liq token rangi bilan to'ldiriladi
 *   - 'soft'  → soft (yumshoq) token bilan to'ldiriladi
 *   - 'empty' → --surface-2 fon (sog'lom / yo'q)
 * `mark` — rangdan tashqari ajratuvchi belgi (WCAG 1.4.1):
 *   - 'x'      → diagonal X (missing)
 *   - 'extract'→ qalin diagonal + tashqi halqa (to_extract, caries'dan farqli)
 */
type StatusMeta = {
  token: string;
  fill: 'fill' | 'soft' | 'empty';
  mark?: 'x' | 'extract';
};

const STATUS: Record<ToothState, StatusMeta> = {
  healthy: { token: '--ink-3', fill: 'empty' },
  caries: { token: '--danger', fill: 'fill' },
  filling: { token: '--info', fill: 'fill' },
  crown: { token: '--warning', fill: 'fill' },
  root_canal: { token: '--primary', fill: 'fill' },
  implant: { token: '--violet', fill: 'fill' },
  missing: { token: '--ink-3', fill: 'empty', mark: 'x' },
  to_extract: { token: '--danger', fill: 'fill', mark: 'extract' },
  temporary: { token: '--warning-soft', fill: 'soft' },
  veneer: { token: '--violet-soft', fill: 'soft' },
};

/** Status swatch foni (legend + palette + tooth surfaces uchun yagona manba). */
function statusFill(state: ToothState): string {
  const meta = STATUS[state];
  if (meta.fill === 'empty') return 'var(--surface-2)';
  if (meta.fill === 'soft') return `var(${meta.token})`;
  return `var(${meta.token})`;
}

export { STATUS, statusFill };

/**
 * Per-surface FDI trapezoid path'lari (36×36 viewBox).
 * B=top, D=right, L=bottom, M=left, O=center kvadrat.
 * `I` (insizal) → markaz mintaqasiga map (O bilan bir xil region; tushib qolmaydi).
 */
const SURFACE_PATHS: Record<Exclude<ToothSurface, 'whole'>, string> = {
  B: 'M2 2 L34 2 L24 12 L12 12 Z',
  D: 'M34 2 L34 34 L24 24 L24 12 Z',
  L: 'M2 34 L34 34 L24 24 L12 24 Z',
  M: 'M2 2 L12 12 L12 24 L2 34 Z',
  O: 'M12 12 L24 12 L24 24 L12 24 Z',
  I: 'M12 12 L24 12 L24 24 L12 24 Z',
};

const SURFACE_ORDER: Array<Exclude<ToothSurface, 'whole' | 'I'>> = ['B', 'D', 'L', 'M', 'O'];

type Props = {
  number: number;
  state: ToothState;
  /** Tanlangan tish surface→state map (markerli tish uchun). Yo'q bo'lsa whole=state. */
  surfaceStates?: Partial<Record<ToothSurface, ToothState>>;
  selected: boolean;
  onClick: () => void;
  /** Detail panel uchun katta render (px). @default 36 */
  size?: number;
  /** Faqat ko'rsatuv — bosish/tanlash o'chiriladi. */
  readOnly?: boolean;
};

export function ToothCell({
  number,
  state,
  surfaceStates,
  selected,
  onClick,
  size = 36,
  readOnly = false,
}: Props) {
  const { t } = useTranslation();
  const stateLabel = t(`tooth_chart.states.${state}`);

  // Har yuza uchun fill: surfaceStates bo'lsa undan, aks holda butun tish = state.
  const fillFor = (surf: Exclude<ToothSurface, 'whole'>): string => {
    const s = surfaceStates?.[surf] ?? surfaceStates?.whole ?? state;
    if (!s || s === 'healthy') return 'var(--surface)';
    return statusFill(s);
  };

  const meta = STATUS[state];
  const showX =
    meta.mark === 'x' || (surfaceStates?.whole && STATUS[surfaceStates.whole].mark === 'x');
  const showExtract =
    meta.mark === 'extract' ||
    (surfaceStates?.whole && STATUS[surfaceStates.whole].mark === 'extract');

  const svg = (
    <svg
      viewBox="0 0 36 36"
      width={size}
      height={size}
      role="presentation"
      aria-hidden="true"
      className={classes.svg}
    >
      {SURFACE_ORDER.map((surf) => (
        <path
          key={surf}
          d={SURFACE_PATHS[surf]}
          fill={fillFor(surf)}
          stroke="var(--border-strong)"
          strokeWidth={0.8}
        />
      ))}
      {showX && (
        <g stroke="var(--ink-3)" strokeWidth={2.4} strokeLinecap="round">
          <line x1="6" y1="6" x2="30" y2="30" />
          <line x1="30" y1="6" x2="6" y2="30" />
        </g>
      )}
      {showExtract && (
        <g>
          <rect
            x="3"
            y="3"
            width="30"
            height="30"
            fill="none"
            stroke="var(--danger)"
            strokeWidth={2.2}
          />
          <g stroke="var(--text-on-danger)" strokeWidth={2.6} strokeLinecap="round">
            <line x1="9" y1="9" x2="27" y2="27" />
            <line x1="27" y1="9" x2="9" y2="27" />
          </g>
        </g>
      )}
    </svg>
  );

  if (readOnly) {
    return (
      <div className={classes.cellStatic} role="img" aria-label={`${number} — ${stateLabel}`}>
        {svg}
        <span className={classes.fdi}>{number}</span>
      </div>
    );
  }

  return (
    <UnstyledButton
      type="button"
      onClick={onClick}
      className={classes.cell}
      // Holat faqat rang bilan emas — aria-label'da raqam + holat nomi (WCAG 1.4.1)
      aria-label={`${number} — ${stateLabel}`}
      aria-pressed={selected}
      data-selected={selected || undefined}
    >
      {svg}
      <span className={classes.fdi} data-selected={selected || undefined}>
        {number}
      </span>
    </UnstyledButton>
  );
}
