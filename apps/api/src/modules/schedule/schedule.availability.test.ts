import { describe, expect, it } from 'bun:test';
import {
  type BranchWorkHours,
  computeAvailability,
  type DoctorSegment,
  weekdayOf,
} from './schedule.availability.ts';

// 2026-06-22 is a Monday. Verify our calendar anchoring first.
const MON = '2026-06-22'; // Monday
const SUN = '2026-06-21'; // Sunday

// Branch open 09:00–18:00 Mon, closed Sun.
const branchHours: BranchWorkHours = {
  mon: { open: '09:00', close: '18:00' },
  sun: null,
};

// Doctor: Mon split shift 09:00–12:00 (540–720) and 13:00–18:00 (780–1080).
const monSegments: DoctorSegment[] = [
  { weekday: 1, startMinute: 540, endMinute: 720 },
  { weekday: 1, startMinute: 780, endMinute: 1080 },
];

describe('weekdayOf — calendar anchoring (no off-by-one)', () => {
  it('maps date strings to JS getUTCDay (0=Sun..6=Sat)', () => {
    expect(weekdayOf(SUN)).toBe(0); // Sunday
    expect(weekdayOf(MON)).toBe(1); // Monday
    expect(weekdayOf('2026-06-27')).toBe(6); // Saturday
  });
});

describe('computeAvailability — slot instants (Asia/Tashkent UTC+5)', () => {
  it('09:00 Tashkent = 04:00:00Z; back-to-back half-open slots', () => {
    const slots = computeAvailability({
      date: MON,
      doctorSegments: [{ weekday: 1, startMinute: 540, endMinute: 660 }], // 09:00–11:00
      branchWorkHours: branchHours,
      appointments: [],
      timeOffs: [],
      slotMinutes: 60,
    });
    expect(slots).toHaveLength(2);
    expect(slots[0]?.start).toBe('2026-06-22T04:00:00.000Z'); // 09:00 +05
    expect(slots[0]?.end).toBe('2026-06-22T05:00:00.000Z'); // 10:00 +05
    // Half-open: next slot starts exactly where prev ended (no touch/overlap).
    expect(slots[1]?.start).toBe(slots[0]?.end);
    expect(slots[1]?.end).toBe('2026-06-22T06:00:00.000Z'); // 11:00 +05
  });
});

describe('computeAvailability — lunch gap', () => {
  it('honors split shift (no slots during 12:00–13:00)', () => {
    const slots = computeAvailability({
      date: MON,
      doctorSegments: monSegments,
      branchWorkHours: branchHours,
      appointments: [],
      timeOffs: [],
      slotMinutes: 60,
    });
    // 09–12 = 3 slots, 13–18 = 5 slots, lunch 12–13 excluded → 8 total.
    expect(slots).toHaveLength(8);
    const minutes = slots.map((s) => [s.startMinute, s.endMinute]);
    expect(minutes).toContainEqual([660, 720]); // 11:00–12:00 present
    expect(minutes).not.toContainEqual([720, 780]); // 12:00–13:00 absent (lunch)
    expect(minutes).toContainEqual([780, 840]); // 13:00–14:00 present
  });
});

describe('computeAvailability — intersect branch ∩ doctor', () => {
  it('clips doctor segment to narrower branch hours', () => {
    const slots = computeAvailability({
      date: MON,
      // Doctor wants 08:00–20:00 but branch only 09:00–18:00.
      doctorSegments: [{ weekday: 1, startMinute: 480, endMinute: 1200 }],
      branchWorkHours: branchHours,
      appointments: [],
      timeOffs: [],
      slotMinutes: 60,
    });
    expect(slots[0]?.startMinute).toBe(540); // 09:00 (branch open)
    expect(slots[slots.length - 1]?.endMinute).toBe(1080); // 18:00 (branch close)
    expect(slots).toHaveLength(9); // 09–18 = 9 hourly slots
  });
});

describe('computeAvailability — appointment busy subtraction', () => {
  it('removes slots overlapping an existing appointment', () => {
    const slots = computeAvailability({
      date: MON,
      doctorSegments: [{ weekday: 1, startMinute: 540, endMinute: 720 }], // 09–12
      branchWorkHours: branchHours,
      // Existing appt 10:00–11:00 Tashkent = 05:00–06:00 UTC.
      appointments: [
        { startAt: new Date('2026-06-22T05:00:00Z'), endAt: new Date('2026-06-22T06:00:00Z') },
      ],
      timeOffs: [],
      slotMinutes: 60,
    });
    const minutes = slots.map((s) => [s.startMinute, s.endMinute]);
    expect(minutes).toContainEqual([540, 600]); // 09–10 free
    expect(minutes).not.toContainEqual([600, 660]); // 10–11 booked
    expect(minutes).toContainEqual([660, 720]); // 11–12 free
    expect(slots).toHaveLength(2);
  });
});

describe('computeAvailability — time-off overlap (multi-day clip)', () => {
  it('clips a multi-day time-off to the day window; full-day -> 0 slots', () => {
    // Time-off spanning the whole day and beyond (prev day 20:00 → next day 08:00).
    const slots = computeAvailability({
      date: MON,
      doctorSegments: monSegments,
      branchWorkHours: branchHours,
      appointments: [],
      timeOffs: [
        {
          startAt: new Date('2026-06-21T15:00:00Z'), // prev day 20:00 +05
          endAt: new Date('2026-06-23T15:00:00Z'), // next day 20:00 +05
        },
      ],
      slotMinutes: 60,
    });
    expect(slots).toHaveLength(0);
  });

  it('partial time-off removes only overlapping slots', () => {
    const slots = computeAvailability({
      date: MON,
      doctorSegments: [{ weekday: 1, startMinute: 540, endMinute: 720 }], // 09–12
      branchWorkHours: branchHours,
      appointments: [],
      // Time-off 09:00–10:00 Tashkent = 04:00–05:00 UTC.
      timeOffs: [
        { startAt: new Date('2026-06-22T04:00:00Z'), endAt: new Date('2026-06-22T05:00:00Z') },
      ],
      slotMinutes: 60,
    });
    const minutes = slots.map((s) => [s.startMinute, s.endMinute]);
    expect(minutes).not.toContainEqual([540, 600]); // 09–10 off
    expect(minutes).toContainEqual([600, 660]); // 10–11 free
    expect(slots).toHaveLength(2);
  });
});

describe('computeAvailability — closed day', () => {
  it('returns no slots when branch is closed (key null)', () => {
    const slots = computeAvailability({
      date: SUN,
      doctorSegments: [{ weekday: 0, startMinute: 540, endMinute: 1080 }],
      branchWorkHours: branchHours, // sun: null
      appointments: [],
      timeOffs: [],
      slotMinutes: 60,
    });
    expect(slots).toHaveLength(0);
  });

  it('returns no slots when doctor has no segment that weekday', () => {
    const slots = computeAvailability({
      date: MON,
      doctorSegments: [{ weekday: 3, startMinute: 540, endMinute: 1080 }], // Wed only
      branchWorkHours: branchHours,
      appointments: [],
      timeOffs: [],
      slotMinutes: 60,
    });
    expect(slots).toHaveLength(0);
  });
});

describe('computeAvailability — effectiveFrom/Until window', () => {
  it('excludes a segment whose effective window does not cover the date', () => {
    const slots = computeAvailability({
      date: MON,
      doctorSegments: [
        {
          weekday: 1,
          startMinute: 540,
          endMinute: 1080,
          effectiveFrom: '2026-07-01', // starts after MON
        },
      ],
      branchWorkHours: branchHours,
      appointments: [],
      timeOffs: [],
      slotMinutes: 60,
    });
    expect(slots).toHaveLength(0);
  });

  it('includes a segment whose window covers the date (inclusive bounds)', () => {
    const slots = computeAvailability({
      date: MON,
      doctorSegments: [
        {
          weekday: 1,
          startMinute: 540,
          endMinute: 600, // 09–10
          effectiveFrom: '2026-06-22',
          effectiveUntil: '2026-06-22',
        },
      ],
      branchWorkHours: branchHours,
      appointments: [],
      timeOffs: [],
      slotMinutes: 60,
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]?.startMinute).toBe(540);
  });
});

describe('computeAvailability — partial trailing time dropped', () => {
  it('drops a trailing window too small for a full slot', () => {
    const slots = computeAvailability({
      date: MON,
      doctorSegments: [{ weekday: 1, startMinute: 540, endMinute: 645 }], // 09:00–10:45
      branchWorkHours: branchHours,
      appointments: [],
      timeOffs: [],
      slotMinutes: 60,
    });
    // Only 09:00–10:00 fits; 10:00–10:45 (45m) dropped.
    expect(slots).toHaveLength(1);
    expect(slots[0]?.endMinute).toBe(600);
  });
});
