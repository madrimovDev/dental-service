import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  dropStartMinute,
  localTimeLabel,
  pickColumnIndex,
  resizeEndMinute,
} from '../appointments.mappers';
import type { CalendarEvent, GridConfig, Tone } from '../appointments.types';
import { GRID, toneVars } from '../appointments.types';
import classes from './CalendarGrid.module.css';
import { StatusIndicator } from './StatusIndicator';

/** Pointer harakati shu masofadan oshgach drag boshlanadi (oddiy bosish — detal paneli). */
const DRAG_THRESHOLD_PX = 4;

type Gesture = {
  kind: 'move' | 'resize';
  pointerId: number;
  startX: number;
  startY: number;
  /** Slot ustida ushlangan nuqta slot tepasidan necha px pastda. */
  grab: number;
  root: HTMLElement;
  body: HTMLElement;
  ownLeft: number;
  active: boolean;
  target: { colKey: string; startMinute: number } | null;
  endMinute: number | null;
};

export function AppointmentSlot({
  event,
  patientName,
  tone = 'muted',
  onClick,
  selected = false,
  draggable = false,
  onMoveGesture,
  onResizeGesture,
  grid = GRID,
  outsideHours = false,
}: {
  event: CalendarEvent;
  patientName: (patientId: string) => string;
  tone?: Tone;
  onClick?: (event: CalendarEvent) => void;
  selected?: boolean;
  /** Sudrab ko'chirish va pastki chetidan cho'zish mumkin (appointment.edit + faol yozilish). */
  draggable?: boolean;
  /** FT-05.3: pointer bilan ko'chirish tugadi — tushgan ustun kaliti (`data-drop-col`) + boshlanish daqiqasi. */
  onMoveGesture?: (event: CalendarEvent, target: { colKey: string; startMinute: number }) => void;
  /** FT-05.3: pastki chetdan cho'zish tugadi — yangi tugash daqiqasi (15 daqiqa qadam). */
  onResizeGesture?: (event: CalendarEvent, endMinute: number) => void;
  grid?: GridConfig;
  /** FT-05.2: filial ish vaqtidan tashqari yozilish — ko'rinadigan belgi. */
  outsideHours?: boolean;
}) {
  const { t } = useTranslation();
  const { pos, appointment, startMin, endMin } = event;
  const width = 100 / pos.laneCount;
  const durationMin = Math.max(endMin - startMin, 0);
  const serviceCount = appointment.serviceIds?.length ?? 0;

  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<{ dx: number; dy: number; height?: number } | null>(null);

  const finish = (commit: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    setPreview(null);
    if (!g?.active) return;
    // Pointer qo'yilgach brauzer `click` chiqaradi — detal panelini ochmasin.
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (!commit) return;
    if (g.kind === 'move' && g.target) onMoveGesture?.(event, g.target);
    if (g.kind === 'resize' && g.endMinute != null && g.endMinute !== endMin) {
      onResizeGesture?.(event, g.endMinute);
    }
  };

  const begin = (e: ReactPointerEvent<HTMLElement>, kind: 'move' | 'resize') => {
    if (!draggable || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const body = e.currentTarget.closest<HTMLElement>('[data-drop-col]');
    const root = e.currentTarget.closest<HTMLElement>('[data-cal-grid]');
    if (!body || !root) return;
    const slotEl =
      kind === 'resize' ? (e.currentTarget.parentElement as HTMLElement) : e.currentTarget;
    gesture.current = {
      kind,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grab: e.clientY - slotEl.getBoundingClientRect().top,
      root,
      body,
      ownLeft: body.getBoundingClientRect().left,
      active: false,
      target: null,
      endMinute: null,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    if (!g.active) {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD_PX) return;
      g.active = true;
    }
    if (g.kind === 'resize') {
      const end = resizeEndMinute(e.clientY, g.body.getBoundingClientRect().top, startMin, grid);
      g.endMinute = end;
      setPreview({ dx: 0, dy: 0, height: (end - startMin) * grid.pxPerMin });
      return;
    }
    const cols = Array.from(g.root.querySelectorAll<HTMLElement>('[data-drop-col]')).map((el) => ({
      el,
      rect: el.getBoundingClientRect(),
    }));
    const idx = pickColumnIndex(
      e.clientX,
      cols.map((c) => c.rect),
    );
    const col = cols[idx];
    if (!col) return;
    const start = dropStartMinute(e.clientY, col.rect.top, g.grab, endMin - startMin, grid);
    g.target = { colKey: col.el.dataset.dropCol ?? '', startMinute: start };
    setPreview({ dx: col.rect.left - g.ownLeft, dy: (start - startMin) * grid.pxPerMin });
  };

  return (
    <button
      type="button"
      className={classes.slot}
      data-status={appointment.status}
      data-selected={selected}
      data-outside-hours={outsideHours || undefined}
      aria-pressed={selected}
      data-draggable={draggable || undefined}
      data-dragging={preview != null || undefined}
      onPointerDown={draggable ? (e) => begin(e, 'move') : undefined}
      onPointerMove={draggable ? move : undefined}
      onPointerUp={draggable ? () => finish(true) : undefined}
      onPointerCancel={draggable ? () => finish(false) : undefined}
      style={{
        // model (a): slot ham, grid line ham .colBody origin'idan → addend YO'Q
        top: pos.top,
        height: preview?.height ?? pos.height,
        left: `${pos.lane * width}%`,
        width: `${width}%`,
        ...(preview && (preview.dx !== 0 || preview.dy !== 0)
          ? { transform: `translate(${preview.dx}px, ${preview.dy}px)` }
          : null),
        ...toneVars(tone),
      }}
      onClick={() => {
        if (suppressClick.current) return;
        onClick?.(event);
      }}
    >
      <span className={classes.slotHead}>
        <span className={classes.slotTime}>
          {localTimeLabel(appointment.startTime)} · {durationMin}
          {t('appointments.minuteShort')}
        </span>
        <StatusIndicator status={appointment.status} size={9} />
      </span>
      {outsideHours ? (
        <span className={classes.slotOutside}>{t('calendar.outside_hours')}</span>
      ) : null}
      <span className={classes.slotPatient}>{patientName(appointment.patientId)}</span>
      {pos.height > 44 && serviceCount > 0 ? (
        <span className={classes.slotService}>
          {serviceCount} {t('appointments.serviceShort')}
        </span>
      ) : null}
      {draggable ? (
        <span
          className={classes.resizeHandle}
          data-resize-handle
          aria-hidden
          onPointerDown={(e) => {
            e.stopPropagation();
            begin(e, 'resize');
          }}
        />
      ) : null}
    </button>
  );
}
