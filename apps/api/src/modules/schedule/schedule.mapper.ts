import type { DoctorSchedule, DoctorTimeOff } from '@dental/db-schema';
import type { AvailabilitySlot } from './schedule.availability.ts';
import type { AvailabilitySlotDto, TimeOffDto, WorkingHoursSegmentDto } from './schedule.schema.ts';

/** Daqiqa (yarim tundan) → "HH:mm". */
export const minuteToHhmm = (minute: number): string => {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** "HH:mm" → daqiqa (yarim tundan). */
export const hhmmToMinute = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** doctor_schedules row → working-hours DTO (minute → "HH:mm"). */
export const toWorkingHoursSegmentDto = (row: DoctorSchedule): WorkingHoursSegmentDto => ({
  id: row.id,
  doctorId: row.doctorId,
  branchId: row.branchId,
  weekday: row.weekday,
  start: minuteToHhmm(row.startMinute),
  end: minuteToHhmm(row.endMinute),
  isActive: row.isActive,
  effectiveFrom: row.effectiveFrom ?? null,
  effectiveUntil: row.effectiveUntil ?? null,
});

/** doctor_time_off row → DTO (instant → ISO). */
export const toTimeOffDto = (row: DoctorTimeOff): TimeOffDto => ({
  id: row.id,
  tenantId: row.tenantId,
  doctorId: row.doctorId,
  branchId: row.branchId ?? null,
  type: row.type,
  startAt: row.startAt.toISOString(),
  endAt: row.endAt.toISOString(),
  reason: row.reason ?? null,
  createdBy: row.createdBy ?? null,
  createdAt: row.createdAt.toISOString(),
});

/** Pure availability slot → wire DTO (already ISO instants from compute). */
export const toAvailabilitySlotDto = (slot: AvailabilitySlot): AvailabilitySlotDto => ({
  start: slot.start,
  end: slot.end,
  startMinute: slot.startMinute,
  endMinute: slot.endMinute,
});
