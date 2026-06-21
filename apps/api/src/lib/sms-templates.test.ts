import { describe, expect, test } from 'bun:test';
import { CLINIC_TZ, formatClinicTime, renderReminderSms } from './sms-templates.ts';

describe('formatClinicTime', () => {
  test('UTC → Asia/Tashkent (UTC+5) numeric DD.MM.YYYY HH:mm', () => {
    // 2026-06-10T05:00:00Z → Tashkent 10:00
    const d = new Date('2026-06-10T05:00:00Z');
    expect(formatClinicTime(d)).toBe('10.06.2026 10:00');
  });

  test('kun chegarasini kesib o‘tish (UTC kechqurun → Tashkent ertasi)', () => {
    // 2026-06-10T20:30:00Z → Tashkent 01:30 (11-iyun)
    const d = new Date('2026-06-10T20:30:00Z');
    expect(formatClinicTime(d)).toBe('11.06.2026 01:30');
  });

  test('CLINIC_TZ = Asia/Tashkent', () => {
    expect(CLINIC_TZ).toBe('Asia/Tashkent');
  });
});

describe('renderReminderSms', () => {
  const startTime = new Date('2026-06-10T05:00:00Z'); // Tashkent 10:00

  test('uz: title + body, local vaqt', () => {
    const r = renderReminderSms({ lang: 'uz', patientName: 'Ali Valiyev', startTime });
    expect(r.title).toBe('Yozilish eslatmasi');
    expect(r.body).toBe('Bemor: Ali Valiyev, 10.06.2026 10:00');
  });

  test('ru: title + body, local vaqt', () => {
    const r = renderReminderSms({ lang: 'ru', patientName: 'Ali Valiyev', startTime });
    expect(r.title).toBe('Напоминание о приёме');
    expect(r.body).toBe('Пациент: Ali Valiyev, 10.06.2026 10:00');
  });

  test('bo‘sh ism: name-siz body (uz)', () => {
    const r = renderReminderSms({ lang: 'uz', patientName: '   ', startTime });
    expect(r.body).toBe('Qabul: 10.06.2026 10:00');
  });

  test('SMS hech qachon UTC ISO ko‘rsatmaydi', () => {
    const r = renderReminderSms({ lang: 'uz', patientName: 'X', startTime });
    expect(r.body).not.toContain('T05:00');
    expect(r.body).not.toContain('Z');
  });
});
