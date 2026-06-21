import type {
  AvailabilitySlot,
  CreateTimeOffType,
  TimeOffDto,
  WorkingHoursSegmentDto,
} from '@dental/api-client';

/** Bitta hafta kuni uchun tahrirlash holatidagi segment (UI ichki model). */
export type EditableSegment = {
  /** React reconciliation uchun barqaror kalit (tarkib emas). */
  key: string;
  start: string; // "HH:mm"
  end: string; // "HH:mm"
};

/** Hafta kuni → segmentlar (weekday 0=Sun..6=Sat). */
export type WeeklyHours = Record<number, EditableSegment[]>;

export type TimeOffType = CreateTimeOffType;

export type { AvailabilitySlot, TimeOffDto, WorkingHoursSegmentDto };
