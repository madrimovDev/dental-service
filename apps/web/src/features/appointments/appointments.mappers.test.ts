import type { Appointment } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import {
  assignLanes,
  dropStartMinute,
  gridFromWorkHours,
  groupByDay,
  instantFromDayMinute,
  isOutsideWorkHours,
  localMinutes,
  newAppointmentHref,
  pickColumnIndex,
  resizeEndMinute,
  toSlotPosition,
} from './appointments.mappers';
import { GRID } from './appointments.types';

function appt(start: string, end: string, id = 'a'): Appointment {
  return {
    id,
    tenantId: 't',
    branchId: 'b',
    patientId: 'p',
    doctorId: 'd',
    assistantId: null,
    startTime: start,
    endTime: end,
    status: 'scheduled',
    serviceIds: [],
    notes: null,
    cancellationReason: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('appointments.mappers — timezone + grid', () => {
  it('localMinutes UTC→Asia/Tashkent (UTC+5)', () => {
    // 2026-06-10T05:00:00Z → Tashkent 10:00 → 600 daqiqa
    expect(localMinutes('2026-06-10T05:00:00Z')).toBe(600);
  });

  it('toSlotPosition: 10:00–10:30, kun boshi 08:00, 88px/soat (Dental OS)', () => {
    // 10:00 = 600 min; dayStart 08:00 = 480 min; (600-480)=120 min × (88/60) = 176px top
    const pos = toSlotPosition(600, 630, GRID);
    expect(pos.top).toBe(176);
    expect(pos.height).toBe(44); // 30 min × 88/60
  });

  it('assignLanes: overlap cluster lane + per-cluster laneCount', () => {
    const a = { startMin: 600, endMin: 660 };
    const b = { startMin: 630, endMin: 690 }; // overlaps a
    const c = { startMin: 700, endMin: 730 }; // alohida klaster (overlap yo'q)
    const laned = assignLanes([a, b, c]);
    expect(laned[0]?.lane).toBe(0);
    expect(laned[1]?.lane).toBe(1); // a bilan overlap → lane 1
    expect(laned[1]?.laneCount).toBe(2); // {a,b} klasteri → 2
    expect(laned[2]?.lane).toBe(0); // alohida → lane 0
    expect(laned[2]?.laneCount).toBe(1); // KRITIK: alohida klaster → laneCount 1 (to'liq kenglik)
  });

  it("groupByDay: kun bo'yicha guruhlaydi (week view)", () => {
    const a1 = appt('2026-06-10T05:00:00Z', '2026-06-10T05:30:00Z', 'a1');
    const a2 = appt('2026-06-11T05:00:00Z', '2026-06-11T05:30:00Z', 'a2');
    const cols = groupByDay([a1, a2], ['2026-06-10', '2026-06-11']);
    expect(cols[0]?.dateKey).toBe('2026-06-10');
    expect(cols[0]?.events).toHaveLength(1);
    expect(cols[1]?.events).toHaveLength(1);
  });
});

describe('sudrab ko‘chirish matematikasi', () => {
  it('Y → 15 daqiqalik qadam, grab offset hisobga olinadi, kun chegarasiga qisiladi', () => {
    // 88 px/soat; 2 soat = 176 px → 10:00
    expect(dropStartMinute(176, 0, 0, 30)).toBe(10 * 60);
    // slotni o'rtasidan (44px) ushlagan: 176+44 → hali 10:00
    expect(dropStartMinute(220, 0, 44, 30)).toBe(10 * 60);
    // 15-daqiqaga yaxlitlash (10:10 → 10:15)
    expect(dropStartMinute(176 + (10 * 88) / 60, 0, 0, 30)).toBe(10 * 60 + 15);
    // kun boshidan oldin / oxiridan keyin qisiladi (oxiri — davomiylik hisobga olingan)
    expect(dropStartMinute(-500, 0, 0, 30)).toBe(8 * 60);
    expect(dropStartMinute(99999, 0, 0, 60)).toBe(19 * 60);
  });

  it('Tashkent kun+daqiqa → UTC instant (UTC+5)', () => {
    expect(instantFromDayMinute('2026-06-10', 10 * 60 + 30)).toBe('2026-06-10T05:30:00.000Z');
  });

  it("FT-05.1: newAppointmentHref bo'sh qiymatlarni tushiradi, vaqtni HH:MM qiladi", () => {
    expect(
      newAppointmentHref({
        doctorId: 'd1',
        branchId: 'b1',
        dateKey: '2026-06-10',
        startMinute: 570,
      }),
    ).toBe('/appointments/new?doctorId=d1&branchId=b1&date=2026-06-10&time=09%3A30');
    expect(newAppointmentHref({ dateKey: '2026-06-10', startMinute: 480 })).toBe(
      '/appointments/new?date=2026-06-10&time=08%3A00',
    );
  });

  // FT-05.2: grid soatlari filial ish vaqtidan (min boshlanish − 1 soat, max tugash + 1 soat).
  describe('gridFromWorkHours', () => {
    const wh = {
      mon: { open: '09:00', close: '18:00' },
      tue: { open: '10:30', close: '17:30' },
      sun: null,
    };

    it('min open − 1 soat .. max close + 1 soat (butun soatga)', () => {
      const g = gridFromWorkHours([wh]);
      expect(g.dayStartHour).toBe(8);
      expect(g.dayEndHour).toBe(19);
      expect(g.pxPerMin).toBe(GRID.pxPerMin);
      expect(g.stepMin).toBe(GRID.stepMin);
    });

    it('yarim soatli tugash yuqoriga yaxlitlanadi (17:30 + 1 soat → 19)', () => {
      const g = gridFromWorkHours([{ mon: { open: '09:00', close: '17:30' } }]);
      expect(g.dayEndHour).toBe(19);
    });

    it("ko'p filial (filial tanlanmagan) — birlashma", () => {
      const g = gridFromWorkHours([
        { mon: { open: '09:00', close: '18:00' } },
        { mon: { open: '07:00', close: '21:00' } },
      ]);
      expect([g.dayStartHour, g.dayEndHour]).toEqual([6, 22]);
    });

    it('0..24 chegarasiga qisiladi', () => {
      const g = gridFromWorkHours([{ mon: { open: '00:30', close: '23:30' } }]);
      expect([g.dayStartHour, g.dayEndHour]).toEqual([0, 24]);
    });

    it("ish soati yo'q/null/bo'sh — standart GRID", () => {
      for (const w of [[], [null], [{}], [{ mon: null }]]) {
        const g = gridFromWorkHours(w);
        expect([g.dayStartHour, g.dayEndHour]).toEqual([GRID.dayStartHour, GRID.dayEndHour]);
      }
    });

    it("ish soatidan tashqaridagi yozilish ham ko'rinadigan oynaga kiradi", () => {
      const g = gridFromWorkHours(
        [wh],
        [appt('2026-06-10T17:15:00Z', '2026-06-10T17:45:00Z', 'late')], // 22:15–22:45 Tashkent
      );
      expect(g.dayEndHour).toBe(23);
      const early = gridFromWorkHours([wh], [appt('2026-06-10T01:00:00Z', '2026-06-10T01:30:00Z')]); // 06:00
      expect(early.dayStartHour).toBe(6);
    });
  });

  describe('isOutsideWorkHours', () => {
    const wh = { wed: { open: '09:00', close: '18:00' }, thu: null };
    // 2026-06-10 — chorshanba
    it('ish vaqti ichida — false; oldin/keyin — true', () => {
      expect(isOutsideWorkHours(appt('2026-06-10T05:00:00Z', '2026-06-10T05:30:00Z'), wh)).toBe(
        false,
      );
      expect(isOutsideWorkHours(appt('2026-06-10T02:00:00Z', '2026-06-10T02:30:00Z'), wh)).toBe(
        true,
      ); // 07:00
      expect(isOutsideWorkHours(appt('2026-06-10T12:45:00Z', '2026-06-10T13:15:00Z'), wh)).toBe(
        true,
      ); // 17:45–18:15
    });
    it('yopiq kun (null) — true; ish soati sozlanmagan — false', () => {
      expect(isOutsideWorkHours(appt('2026-06-11T05:00:00Z', '2026-06-11T05:30:00Z'), wh)).toBe(
        true,
      );
      expect(isOutsideWorkHours(appt('2026-06-11T05:00:00Z', '2026-06-11T05:30:00Z'), null)).toBe(
        false,
      );
      expect(isOutsideWorkHours(appt('2026-06-11T05:00:00Z', '2026-06-11T05:30:00Z'), {})).toBe(
        false,
      );
    });
  });
});

describe('FT-05.3 pointer drag/resize yordamchilari', () => {
  it('resizeEndMinute: pastki chet 15 daqiqa qadamga yaxlitlanadi, kamida start+15, kun oxirigacha', () => {
    // 88 px/soat: 11:00 = (11-8)*88 = 264px
    expect(resizeEndMinute(264, 0, 10 * 60)).toBe(11 * 60);
    // 11:10 → 11:15
    expect(resizeEndMinute(264 + (10 * 88) / 60, 0, 10 * 60)).toBe(11 * 60 + 15);
    // start ustidan yuqoriga tortilsa — kamida 15 daqiqa
    expect(resizeEndMinute(0, 0, 10 * 60)).toBe(10 * 60 + 15);
    // kun oxiridan keyin qisiladi
    expect(resizeEndMinute(99999, 0, 10 * 60)).toBe(20 * 60);
    // body top hisobga olinadi
    expect(resizeEndMinute(1264, 1000, 10 * 60)).toBe(11 * 60);
  });

  it('pickColumnIndex: x qaysi ustun ichida bo‘lsa shu, tashqarida — eng yaqin chet', () => {
    const rects = [
      { left: 0, right: 100 },
      { left: 100, right: 200 },
      { left: 200, right: 300 },
    ];
    expect(pickColumnIndex(50, rects)).toBe(0);
    expect(pickColumnIndex(100, rects)).toBe(1);
    expect(pickColumnIndex(299, rects)).toBe(2);
    expect(pickColumnIndex(-30, rects)).toBe(0);
    expect(pickColumnIndex(900, rects)).toBe(2);
    expect(pickColumnIndex(10, [])).toBe(-1);
  });
});
