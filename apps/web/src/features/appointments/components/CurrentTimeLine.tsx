import { useEffect, useState } from 'react';
import { localMinutes } from '../appointments.mappers';
import { GRID, type GridConfig } from '../appointments.types';
import classes from './CurrentTimeLine.module.css';

/** Joriy local (Asia/Tashkent) daqiqa — kun boshidan. */
function nowLocalMinutes(): number {
  return localMinutes(new Date().toISOString());
}

function label(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Joriy-vaqt chizig'i (Dental OS spec §6.1) — FAQAT day-view.
 * 2px var(--danger) bar + mono vaqt badge (var(--text-on-danger), `#fff` EMAS) + chap-chekka dot.
 * Grid oynasidan (standart 08:00–20:00, FT-05.2: filial ish vaqtidan) tashqarida yashirinadi. setInterval 60s — unmount'da tozalanadi.
 */
export function CurrentTimeLine({
  showBadge = true,
  grid = GRID,
}: {
  showBadge?: boolean;
  grid?: GridConfig;
}) {
  const [minutes, setMinutes] = useState(nowLocalMinutes);

  useEffect(() => {
    const id = setInterval(() => setMinutes(nowLocalMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  const dayStart = grid.dayStartHour * 60;
  const dayEnd = grid.dayEndHour * 60;
  if (minutes < dayStart || minutes > dayEnd) return null;

  const top = (minutes - dayStart) * grid.pxPerMin;

  return (
    <div className={classes.line} style={{ top }} aria-hidden data-testid="now-line">
      {showBadge ? <span className={classes.dot} /> : null}
      <span className={classes.bar} />
      {showBadge ? <span className={classes.badge}>{label(minutes)}</span> : null}
    </div>
  );
}
