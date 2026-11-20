import type {
  Appointment,
  BranchWorkHours,
  CalendarEvent,
  DayColumn,
  Doctor,
  DoctorColumn,
  GridConfig,
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
export function toSlotPosition(startMin: number, endMin: number, grid: GridConfig = GRID) {
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
export function toDoctorEvents(appts: Appointment[], grid: GridConfig = GRID): CalendarEvent[] {
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
  grid: GridConfig = GRID,
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
export function groupByDay(
  appts: Appointment[],
  dayKeys: string[],
  grid: GridConfig = GRID,
): DayColumn[] {
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
  grid: GridConfig = GRID,
): number {
  const raw = (clientY - bodyTop - grabOffsetPx) / grid.pxPerMin + grid.dayStartHour * 60;
  const snapped = Math.round(raw / DRAG_SNAP_MIN) * DRAG_SNAP_MIN;
  const min = grid.dayStartHour * 60;
  const max = grid.dayEndHour * 60 - Math.max(durationMin, DRAG_SNAP_MIN);
  return Math.min(Math.max(snapped, min), Math.max(max, min));
}

/**
 * FT-05.3: slot pastki chetini cho'zish — pointer Y → yangi TUGASH daqiqasi.
 * `DRAG_SNAP_MIN` qadamga yaxlitlanadi; kamida `startMin + DRAG_SNAP_MIN`, kun oxirigacha.
 */
export function resizeEndMinute(
  clientY: number,
  bodyTop: number,
  startMin: number,
  grid: GridConfig = GRID,
): number {
  const raw = (clientY - bodyTop) / grid.pxPerMin + grid.dayStartHour * 60;
  const snapped = Math.round(raw / DRAG_SNAP_MIN) * DRAG_SNAP_MIN;
  const min = startMin + DRAG_SNAP_MIN;
  const max = Math.max(grid.dayEndHour * 60, min);
  return Math.min(Math.max(snapped, min), max);
}

/**
 * FT-05.3: pointer X qaysi ustunda (doktor/kun). Ustun ichida bo'lmasa — eng yaqin chet
 * ustun (kalendar chetidan tashqariga tortilsa ham yozilish yo'qolmaydi). Ustun yo'q → -1.
 */
export function pickColumnIndex(
  clientX: number,
  rects: ReadonlyArray<{ left: number; right: number }>,
): number {
  if (rects.length === 0) return -1;
  const inside = rects.findIndex((r) => clientX >= r.left && clientX < r.right);
  if (inside >= 0) return inside;
  const first = rects[0];
  return first && clientX < first.left ? 0 : rects.length - 1;
}

/** Tashkent kun kaliti + kun boshidan daqiqa → UTC ISO instant (Tashkent = UTC+5, DST yo'q). */
export function instantFromDayMinute(dateKey: string, minute: number): string {
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return new Date(`${dateKey}T${hh}:${mm}:00+05:00`).toISOString();
}

/** Kun boshidan daqiqa → 'HH:MM'. */
export function minuteLabel(minute: number): string {
  const hh = String(Math.floor(minute / 60)).padStart(2, '0');
  const mm = String(minute % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Grid yarim soatlik qatori indeksi → kun boshidan boshlanish daqiqasi (Tashkent). */
export function cellStartMinute(rowIndex: number, grid: GridConfig = GRID): number {
  return grid.dayStartHour * 60 + rowIndex * grid.stepMin;
}

/**
 * FT-05.1: bo'sh katak / bo'sh slot → `/appointments/new` — doktor, filial, sana (YYYY-MM-DD,
 * Tashkent) va vaqt (HH:MM) oldindan to'ldiriladi. Bo'sh qiymatlar URL'ga qo'yilmaydi.
 */
export function newAppointmentHref(p: {
  doctorId?: string | null;
  branchId?: string | null;
  dateKey: string;
  startMinute: number;
}): string {
  const q = new URLSearchParams();
  if (p.doctorId) q.set('doctorId', p.doctorId);
  if (p.branchId) q.set('branchId', p.branchId);
  q.set('date', p.dateKey);
  q.set('time', minuteLabel(p.startMinute));
  return `/appointments/new?${q.toString()}`;
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** `{open,close}` ("HH:mm") yoki null (yopiq/noto'g'ri qiymat). */
function readHours(v: unknown): { open: number; close: number } | null {
  if (v == null || typeof v !== 'object') return null;
  const { open, close } = v as { open?: unknown; close?: unknown };
  if (typeof open !== 'string' || typeof close !== 'string') return null;
  const o = hhmmToMinutes(open);
  const c = hhmmToMinutes(close);
  return Number.isFinite(o) && Number.isFinite(c) ? { open: o, close: c } : null;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * FT-05.2: grid oynasi filial ish vaqtidan — min boshlanish − 1 soat .. max tugash + 1 soat
 * (butun soatga, 0..24 ga qisiladi). `workHoursList` — bir yoki bir necha filial (filial
 * tanlanmagan bo'lsa birlashma). Hech qayerda ochiq kun yo'q → standart `base`.
 * `appts` — oyna tashqarisidagi yozilishlar ham ko'rinishi uchun oyna ularni qamraydi.
 */
export function gridFromWorkHours(
  workHoursList: ReadonlyArray<BranchWorkHours | undefined>,
  appts: ReadonlyArray<Appointment> = [],
  base: GridConfig = GRID,
): GridConfig {
  let minOpen = Number.POSITIVE_INFINITY;
  let maxClose = Number.NEGATIVE_INFINITY;
  for (const wh of workHoursList) {
    if (!wh) continue;
    for (const raw of Object.values(wh)) {
      const entry = readHours(raw);
      if (!entry || entry.close <= entry.open) continue;
      minOpen = Math.min(minOpen, entry.open);
      maxClose = Math.max(maxClose, entry.close);
    }
  }
  let start = base.dayStartHour;
  let end = base.dayEndHour;
  if (Number.isFinite(minOpen) && Number.isFinite(maxClose)) {
    start = Math.max(0, Math.floor(minOpen / 60) - 1);
    end = Math.min(24, Math.ceil(maxClose / 60) + 1);
  }
  for (const a of appts) {
    const s = localMinutes(a.startTime);
    let e = localMinutes(a.endTime);
    if (e <= s) e = 24 * 60; // yarim tundan oshgan
    start = Math.min(start, Math.floor(s / 60));
    end = Math.max(end, Math.min(24, Math.ceil(e / 60)));
  }
  return { ...base, dayStartHour: start, dayEndHour: Math.max(end, start + 1) };
}

/**
 * FT-05.2: yozilish filial ish vaqtidan tashqarida (yopiq kun yoki oldin/keyin) — «soatdan tashqari»
 * belgisi uchun. Ish soati sozlanmagan (null / ochiq kun yo'q) → `false` (belgi chiqmaydi).
 */
export function isOutsideWorkHours(
  appt: Pick<Appointment, 'startTime' | 'endTime'>,
  workHours: BranchWorkHours | undefined,
): boolean {
  if (!workHours) return false;
  const anyOpen = Object.values(workHours).some((e) => readHours(e) != null);
  if (!anyOpen) return false;
  const weekday = new Date(`${localDateKey(appt.startTime)}T00:00:00Z`).getUTCDay();
  const entry = readHours(workHours[WEEKDAY_KEYS[weekday] ?? '']);
  if (!entry) return true;
  const s = localMinutes(appt.startTime);
  let e = localMinutes(appt.endTime);
  if (e <= s) e = 24 * 60;
  return s < entry.open || e > entry.close;
}
