import type { Appointment } from '@dental/api-client';
import type { CalendarEvent, DayColumn, Doctor, DoctorColumn } from './appointments.types';
import { GRID } from './appointments.types';

const TZ = 'Asia/Tashkent';

/** UTC ISO → kun boshidan local (Asia/Tashkent) daqiqa. */
export function localMinutes(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return h * 60 + m;
}

/** Local sana kaliti (YYYY-MM-DD, Asia/Tashkent) — guruhlash uchun. */
export function localDateKey(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
}

export function localTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

type Laned<T> = T & { lane: number; laneCount: number };

/** Pozitsiya (top/height px) — lane'siz (lane assignLanes'dan). */
export function toSlotPosition(startMin: number, endMin: number, grid = GRID) {
  const dayStart = grid.dayStartHour * 60;
  const top = (startMin - dayStart) * grid.pxPerMin;
  const height = Math.max((endMin - startMin) * grid.pxPerMin, grid.pxPerMin * 10);
  return { top, height };
}

/**
 * Overlap lane tayinlash — PER-KLASTER laneCount.
 * Connected overlap klaster (a∩b, b∩c → bitta klaster) ichida greedy lane;
 * laneCount = SHU klaster lane soni (overlap'siz event → laneCount 1, to'liq kenglik).
 */
export function assignLanes<T extends { startMin: number; endMin: number }>(
  events: T[],
): Laned<T>[] {
  const out: Laned<T>[] = [...events]
    .sort((a, b) => a.startMin - b.startMin)
    .map((e) => ({ ...e, lane: 0, laneCount: 1 }));

  let i = 0;
  while (i < out.length) {
    const head = out[i];
    if (head === undefined) break;
    // klaster: ketma-ket eventlar startMin < running max endMin
    let clusterEnd = head.endMin;
    let j = i;
    let next = out[j + 1];
    while (next !== undefined && next.startMin < clusterEnd) {
      j += 1;
      clusterEnd = Math.max(clusterEnd, next.endMin);
      next = out[j + 1];
    }
    const cluster = out.slice(i, j + 1);
    // greedy lane (klaster ichida)
    const laneEnds: number[] = [];
    for (const e of cluster) {
      let lane = laneEnds.findIndex((end) => end <= e.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e.endMin);
      } else {
        laneEnds[lane] = e.endMin;
      }
      e.lane = lane;
    }
    const count = laneEnds.length;
    for (const e of cluster) {
      e.laneCount = count;
    }
    i = j + 1;
  }
  return out;
}

/** Appointment[] → bir doktor uchun CalendarEvent[] (pozitsiya + lane). */
export function toDoctorEvents(appts: Appointment[], grid = GRID): CalendarEvent[] {
  const base = appts.map((a) => ({
    appointment: a,
    doctorId: a.doctorId,
    startMin: localMinutes(a.startTime),
    endMin: localMinutes(a.endTime),
  }));
  const laned = assignLanes(base);
  return laned.map((e) => ({
    ...e,
    pos: { ...toSlotPosition(e.startMin, e.endMin, grid), lane: e.lane, laneCount: e.laneCount },
  }));
}

/** Day view: doktor bo'yicha ustunlar. */
export function groupByDoctor(
  appts: Appointment[],
  doctors: Doctor[],
  grid = GRID,
): DoctorColumn[] {
  return doctors.map((doctor) => ({
    doctor,
    events: toDoctorEvents(
      appts.filter((a) => a.doctorId === doctor.id),
      grid,
    ),
  }));
}

/** Week view: kun (local sana) bo'yicha ustunlar. `dayKeys` — YYYY-MM-DD (Asia/Tashkent) ro'yxati. */
export function groupByDay(appts: Appointment[], dayKeys: string[], grid = GRID): DayColumn[] {
  return dayKeys.map((dateKey) => ({
    dateKey,
    events: toDoctorEvents(
      appts.filter((a) => localDateKey(a.startTime) === dateKey),
      grid,
    ),
  }));
}
