import { describe, expect, it } from 'vitest';
import {
  formatRecallDate,
  isOverdue,
  localToday,
  recallReasonLabelKey,
  recallSmsStatusLabelKey,
  recallSmsStatusTone,
  recallStatusLabelKey,
} from './recalls.mappers';

describe('localToday (Asia/Tashkent UTC+5)', () => {
  it('00:30 UTC → ertangi kalendar sana Tashkentda (UTC+5)', () => {
    // 2026-06-20T00:30:00Z = 05:30 Tashkent → hali 2026-06-20
    expect(localToday(new Date('2026-06-20T00:30:00Z'))).toBe('2026-06-20');
  });

  it("19:30 UTC → keyingi kun Tashkentda (chunki +5 yarim tundan o'tadi)", () => {
    // 2026-06-20T19:30:00Z = 00:30 Tashkent ertasi → 2026-06-21
    expect(localToday(new Date('2026-06-20T19:30:00Z'))).toBe('2026-06-21');
  });
});

describe('isOverdue', () => {
  it('dueDate < today → true', () => {
    expect(isOverdue('2026-06-19', '2026-06-20')).toBe(true);
  });
  it("dueDate === today → false (bugun muddati keladi, o'tmagan)", () => {
    expect(isOverdue('2026-06-20', '2026-06-20')).toBe(false);
  });
  it('dueDate > today → false', () => {
    expect(isOverdue('2026-06-21', '2026-06-20')).toBe(false);
  });
});

describe('label key derivation', () => {
  it('status → recall.status.<status>', () => {
    expect(recallStatusLabelKey('pending')).toBe('recall.status.pending');
    expect(recallStatusLabelKey('dismissed')).toBe('recall.status.dismissed');
  });
  it('reason → recall.reason.<reason>', () => {
    expect(recallReasonLabelKey('manual')).toBe('recall.reason.manual');
    expect(recallReasonLabelKey('treatment_followup')).toBe('recall.reason.treatment_followup');
  });
});

describe('formatRecallDate', () => {
  it('UTC ISO instant → Tashkent kalendar sanasi', () => {
    // 2026-06-20T20:00:00Z = 01:00 Tashkent 21-iyun
    expect(formatRecallDate('2026-06-20T20:00:00Z')).toBe('2026-06-21');
  });
});

describe('recallSmsStatusLabelKey (DS7 SMS ustuni)', () => {
  it('tanilgan qiymat → recall.sms_status.<value>', () => {
    expect(recallSmsStatusLabelKey('sent')).toBe('recall.sms_status.sent');
    expect(recallSmsStatusLabelKey('pending')).toBe('recall.sms_status.pending');
    expect(recallSmsStatusLabelKey('failed')).toBe('recall.sms_status.failed');
    expect(recallSmsStatusLabelKey('replied')).toBe('recall.sms_status.replied');
  });
  it('null → recall.sms_status.none (SMS yuborilmagan)', () => {
    expect(recallSmsStatusLabelKey(null)).toBe('recall.sms_status.none');
  });
  it('notanish qiymat → none (default xavfsiz)', () => {
    expect(recallSmsStatusLabelKey('queued')).toBe('recall.sms_status.none');
  });
});

describe('recallSmsStatusTone', () => {
  it('sent→success, replied→info, pending→warning, failed→danger', () => {
    expect(recallSmsStatusTone('sent')).toBe('success');
    expect(recallSmsStatusTone('replied')).toBe('info');
    expect(recallSmsStatusTone('pending')).toBe('warning');
    expect(recallSmsStatusTone('failed')).toBe('danger');
  });
  it('null/notanish → neutral', () => {
    expect(recallSmsStatusTone(null)).toBe('neutral');
    expect(recallSmsStatusTone('queued')).toBe('neutral');
  });
});
