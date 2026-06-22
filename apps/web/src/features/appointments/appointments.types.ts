import type { Appointment, AppointmentStatus } from '@dental/api-client';
import type React from 'react';

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
  dayEndHour: 20, // SAQLANADI (ds12 §DS4) — 18 post-18:00 yozilishlarni yashiradi
  stepMin: 30,
  pxPerMin: 88 / 60, // Dental OS zichlik: 88px / 1 soat (oldin 40px / 30 daqiqa)
} as const;

/**
 * Ustun tone-cycling (Dental OS). Har ustun (doktor yoki kun) indeksidan barqaror
 * tone oladi: TONES[index % TONES.length]. 'muted' faqat doktorsiz fallback.
 */
export const TONES = ['primary', 'info', 'violet', 'success', 'warning', 'danger'] as const;
export type Tone = (typeof TONES)[number] | 'muted';

export function toneForIndex(index: number): Tone {
  return TONES[index % TONES.length] ?? 'muted';
}

/**
 * Tone → CSS o'zgaruvchilari (`--tone` / `--tone-soft`) inline `style` uchun.
 * 'muted' → ink-3 / surface-2 (doktorsiz fallback). Faqat mavjud tokenlar.
 */
export function toneVars(tone: Tone): React.CSSProperties {
  if (tone === 'muted') {
    return { '--tone': 'var(--ink-3)', '--tone-soft': 'var(--surface-2)' } as React.CSSProperties;
  }
  return {
    '--tone': `var(--${tone})`,
    '--tone-soft': `var(--${tone}-soft)`,
  } as React.CSSProperties;
}

export type { Appointment, AppointmentStatus };
