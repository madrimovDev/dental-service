import type { Appointment, AppointmentStatus } from '@dental/api-client';

export type Doctor = { id: string; name: string };

/** Grid pozitsiyasi (px). */
export type SlotPosition = { top: number; height: number; lane: number; laneCount: number };

/** Kalendar slot — appointment + pozitsiya + ko'rsatish maydonlari. */
export type CalendarEvent = {
  appointment: Appointment;
  doctorId: string;
  startMin: number; // kun boshidan local daqiqa
  endMin: number;
  pos: SlotPosition;
};

export type DoctorColumn = { doctor: Doctor; events: CalendarEvent[] };
export type DayColumn = { dateKey: string; events: CalendarEvent[] };

export const GRID = {
  dayStartHour: 8,
  dayEndHour: 20,
  stepMin: 30,
  pxPerMin: 40 / 30, // 40px / 30 daqiqa
} as const;

export type { Appointment, AppointmentStatus };
