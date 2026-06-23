interface DonutSegment {
  label: string;
  value: number;
  color: string;
}
interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  title?: string;
}

/** Yengil SVG donut (stroke-dasharray arklar) — chart-lib dep'siz. */
export function Donut({ segments, size = 120, thickness = 14, title }: DonutProps) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={title ?? ''}
    >
      {title && <title>{title}</title>}
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total === 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={thickness}
          />
        )}
        {total > 0 &&
          segments.map((s) => {
            const frac = Math.max(0, s.value) / total;
            const dash = `${frac * circ} ${circ}`;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset * circ}
              />
            );
            offset += frac;
            return el;
          })}
      </g>
    </svg>
  );
}
