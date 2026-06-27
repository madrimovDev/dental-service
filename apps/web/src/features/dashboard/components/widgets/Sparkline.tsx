interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}

/** Yengil 78×30 SVG polyline sparkline — chart-lib dep'siz (StatCard «og'ir grafiksiz»). */
export function Sparkline({
  points,
  width = 78,
  height = 30,
  color = 'var(--primary)',
}: SparklineProps) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const dx = width / (points.length - 1);
  const path = points.map((p, i) => `${i * dx},${height - ((p - min) / span) * height}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true">
      <polyline points={path} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}
