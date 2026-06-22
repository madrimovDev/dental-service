import type { Appointment } from '@dental/api-client';
import { describe, expect, it } from 'vitest';
import { assignLanes, groupByDay, localMinutes, toSlotPosition } from './appointments.mappers';
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
