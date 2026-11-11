import type {
  Appointment,
  CalendarEvent,
  DayColumn,
  Doctor,
  DoctorColumn,
} from './appointments.types';
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

/**
 * A11 (CLI-438): sof kalendar arifmetika — 'YYYY-MM-DD' kalitga `delta` kun qo'shadi.
 * `T00:00:00Z` bilan parse qilinadi (browser TZ'ga bog'liq EMAS) — natija yana
 * 'YYYY-MM-DD'. Bu haqiqiy vaqt EMAS, faqat kalendar kun-hisoblash vositasi
 * (Tashkent kun-kalitlari ustida ishlaydi, chunki dateKey allaqachon Tashkent
 * TZ'da olingan — `localDateKey`).
 */
export function addDaysToDateKey(dateKey: string, delta: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * A11: berilgan Tashkent kun-kalitini o'z ichiga olgan haftaning dushanbasi
 * (kalendar kun-nomi TZ'dan mustaqil — 'YYYY-MM-DD' universal fakt).
 */
export function mondayOfWeek(dateKey: string): string {
  const weekday = new Date(`${dateKey}T00:00:00Z`).getUTCDay(); // 0=Yak..6=Shan
  const diff = (weekday + 6) % 7; // Dushanba=0
  return addDaysToDateKey(dateKey, -diff);
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

/** Sudrab ko'chirish qadami (daqiqa). */
export const DRAG_SNAP_MIN = 15;

/**
 * Sudralgan yozilish tushirilgan Y koordinatasidan yangi boshlanish daqiqasi (kun boshidan,
 * Tashkent). `grabOffsetPx` — slot ustida ushlangan nuqta slot tepasidan qancha pastda.
 * Qadam `DRAG_SNAP_MIN`; kun chegarasiga (GRID) qisiladi — yozilish chegaradan chiqmaydi.
 */
export function dropStartMinute(
  clientY: number,
  bodyTop: number,
  grabOffsetPx: number,
  durationMin: number,
  grid = GRID,
): number {
  const raw = (clientY - bodyTop - grabOffsetPx) / grid.pxPerMin + grid.dayStartHour * 60;
  const snapped = Math.round(raw / DRAG_SNAP_MIN) * DRAG_SNAP_MIN;
  const min = grid.dayStartHour * 60;
  const max = grid.dayEndHour * 60 - Math.max(durationMin, DRAG_SNAP_MIN);
  return Math.min(Math.max(snapped, min), Math.max(max, min));
}

/** Tashkent kun kaliti + kun boshidan daqiqa → UTC ISO instant (Tashkent = UTC+5, DST yo'q). */
export function instantFromDayMinute(dateKey: string, minute: number): string {
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return new Date(`${dateKey}T${hh}:${mm}:00+05:00`).toISOString();
}
