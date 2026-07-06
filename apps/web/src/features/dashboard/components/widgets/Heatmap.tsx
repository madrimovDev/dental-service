import { type CSSProperties, Fragment } from 'react';
import { useTranslation } from 'react-i18next';

interface HeatCell {
  weekday: number;
  hour: number;
  count: number;
}

interface HeatmapProps {
  cells: HeatCell[];
  hours?: number[];
}

const DEFAULT_HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8..20

/** Weekday display order: Mon(1)..Sat(6), Sun(0) */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * CSS-grid occupancy heatmap — chart-lib dep'siz.
 * Columns = weekdays (Mon–Sun), rows = working hours.
 * Cell background = var(--primary) at opacity proportional to count/max.
 */
export function Heatmap({ cells, hours = DEFAULT_HOURS }: HeatmapProps) {
  const { t } = useTranslation();
  const max = Math.max(1, ...cells.map((c) => c.count));
  const at = (w: number, h: number) =>
    cells.find((c) => c.weekday === w && c.hour === h)?.count ?? 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `40px repeat(${WEEKDAY_ORDER.length}, 1fr)`,
        gap: 2,
        fontSize: 11,
        lineHeight: '1.2',
      }}
    >
      {/* Header row: empty corner + weekday labels */}
      <div />
      {WEEKDAY_ORDER.map((wd) => (
        <div
          key={wd}
          style={{
            textAlign: 'center',
            padding: '2px 0',
            color: 'var(--ink-2)',
            fontWeight: 600,
            fontSize: 11,
          }}
        >
          {t(`schedule.weekday.${wd}`)}
        </div>
      ))}

      {/* Data rows: one per hour */}
      {hours.map((h) => (
        <Fragment key={h}>
          {/* Hour label */}
          <div
            style={{
              textAlign: 'right',
              paddingRight: 6,
              paddingTop: 4,
              color: 'var(--ink-3)',
              fontSize: 10,
              alignSelf: 'center',
            }}
          >
            {String(h).padStart(2, '0')}:00
          </div>

          {/* Cells */}
          {WEEKDAY_ORDER.map((wd) => {
            const cnt = at(wd, h);
            const cellStyle: CSSProperties =
              cnt > 0
                ? {
                    height: 18,
                    borderRadius: 3,
                    background: 'var(--primary)',
                    opacity: Math.max(0.15, cnt / max),
                  }
                : {
                    height: 18,
                    borderRadius: 3,
                    background: 'var(--surface-2)',
                  };
            return (
              <div
                key={`cell-${wd}-${h}`}
                title={cnt > 0 ? String(cnt) : undefined}
                style={cellStyle}
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
