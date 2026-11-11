import { describe, expect, it } from 'vitest';
import {
  compareDueWithAppointment,
  formatDueDate,
  nextAppointmentStart,
} from './lab-order.helpers';

describe('lab-order helpers (UI-D5)', () => {
  it('formatDueDate: YYYY-MM-DD → DD.MM.YYYY, bo‘sh → null', () => {
    expect(formatDueDate('2026-11-18')).toBe('18.11.2026');
    expect(formatDueDate(null)).toBeNull();
  });

  it('nextAppointmentStart: faqat kelgusi faol yozilishlar, eng yaqini', () => {
    const now = new Date('2026-11-11T10:00:00');
    const r = nextAppointmentStart(
      [
        { startTime: '2026-11-10T10:00:00', status: 'scheduled' }, // o'tgan
        { startTime: '2026-11-13T10:00:00', status: 'cancelled' },
        { startTime: '2026-11-20T10:00:00', status: 'confirmed' },
        { startTime: '2026-11-15T09:00:00', status: 'scheduled' },
      ],
      now,
    );
    expect(r).toBe('2026-11-15T09:00:00');
    expect(nextAppointmentStart([], now)).toBeNull();
    expect(nextAppointmentStart(undefined, now)).toBeNull();
  });

  it('compareDueWithAppointment: zaxira / kech / yozilish yo‘q', () => {
    // muddat 18-noyabr, yozilish 20-noyabr → 2 kun zaxira
    expect(compareDueWithAppointment('2026-11-18', '2026-11-20T10:00:00')).toMatchObject({
      kind: 'ok',
      days: 2,
      apptDate: '20.11.2026',
      apptTime: '10:00',
    });
    // muddat yozilish kuni — zaxira 0, hali kech emas
    expect(compareDueWithAppointment('2026-11-20', '2026-11-20T10:00:00')).toMatchObject({
      kind: 'ok',
      days: 0,
    });
    // muddat 22-noyabr, yozilish 20-noyabr → 2 kun kech
    expect(compareDueWithAppointment('2026-11-22', '2026-11-20T10:00:00')).toMatchObject({
      kind: 'late',
      days: 2,
    });
    expect(compareDueWithAppointment('2026-11-22', null)).toEqual({ kind: 'none' });
    expect(compareDueWithAppointment('', '2026-11-20T10:00:00')).toEqual({ kind: 'none' });
  });
});
