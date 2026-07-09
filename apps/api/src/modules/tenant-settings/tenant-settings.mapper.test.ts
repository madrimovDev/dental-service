// CLI-379/400: mapper imports `../../lib/crypto.ts` (transitively `env.ts`, which
// validates `Bun.env` at import time). A static `import` is hoisted and evaluated
// BEFORE this assignment regardless of source-order (see task-1-report.md /
// crypto.test.ts for the empirical repro) — so both the tested module and
// `encryptSecret` (used to build fixtures below) are loaded via dynamic
// `import()`, which runs as a normal expression in source order.
process.env.MESSAGING_SECRET = 'test-only-messaging-secret-32chars-long';

import { describe, expect, test } from 'bun:test';

const { encryptSecret } = await import('../../lib/crypto.ts');
const { mergeNotificationSettings, toNotificationSettingsDto, toTenantSettingsDto } = await import(
  './tenant-settings.mapper.ts'
);

describe('toTenantSettingsDto', () => {
  test('maps Date timestamps to ISO strings', () => {
    const row = {
      id: 'id-1',
      tenantId: 't-1',
      vertical: 'dental',
      reminderLeadHours: 24,
      currency: 'UZS',
      onboardingDismissedAt: null,
      defaultRecallIntervalMonths: 6,
      timezone: 'Asia/Tashkent',
      recallSendHourLocal: 10,
      maxDiscountPercent: 100,
      noShowStrikeThreshold: 3,
      notificationSettings: null,
      integrationSettings: null,
      createdAt: new Date('2026-06-12T10:00:00.000Z'),
      updatedAt: new Date('2026-06-12T11:00:00.000Z'),
    };
    const dto = toTenantSettingsDto(row);
    expect(dto.createdAt).toBe('2026-06-12T10:00:00.000Z');
    expect(dto.updatedAt).toBe('2026-06-12T11:00:00.000Z');
    expect(dto.vertical).toBe('dental');
    expect(dto.onboardingDismissedAt).toBeNull();
  });

  test('maps onboardingDismissedAt Date to ISO string', () => {
    const row = {
      id: 'id-1',
      tenantId: 't-1',
      vertical: 'dental',
      reminderLeadHours: 24,
      currency: 'UZS',
      onboardingDismissedAt: new Date('2026-06-13T08:30:00.000Z'),
      defaultRecallIntervalMonths: 6,
      timezone: 'Asia/Tashkent',
      recallSendHourLocal: 10,
      maxDiscountPercent: 100,
      noShowStrikeThreshold: 3,
      notificationSettings: null,
      integrationSettings: null,
      createdAt: new Date('2026-06-12T10:00:00.000Z'),
      updatedAt: new Date('2026-06-12T11:00:00.000Z'),
    };
    const dto = toTenantSettingsDto(row);
    expect(dto.onboardingDismissedAt).toBe('2026-06-13T08:30:00.000Z');
  });

  test('fills notification/integration defaults when JSONB null', () => {
    const row = {
      id: 'id-1',
      tenantId: 't-1',
      vertical: 'dental',
      reminderLeadHours: 24,
      currency: 'UZS',
      onboardingDismissedAt: null,
      defaultRecallIntervalMonths: 6,
      timezone: 'Asia/Tashkent',
      recallSendHourLocal: 10,
      maxDiscountPercent: 100,
      noShowStrikeThreshold: 3,
      notificationSettings: null,
      integrationSettings: null,
      createdAt: new Date('2026-06-12T10:00:00.000Z'),
      updatedAt: new Date('2026-06-12T11:00:00.000Z'),
    };
    const dto = toTenantSettingsDto(row);
    expect(dto.notificationSettings).toEqual({
      appointmentReminder: true,
      recallSms: true,
      paymentReceipt: false,
    });
    expect(dto.integrationSettings).toEqual({
      telegram: { configured: false, hint: null },
      sms: { configured: false, hint: null },
    });
  });

  test('maps maxDiscountPercent through (CLI-444)', () => {
    const row = {
      id: 'id-1',
      tenantId: 't-1',
      vertical: 'dental',
      reminderLeadHours: 24,
      currency: 'UZS',
      onboardingDismissedAt: null,
      defaultRecallIntervalMonths: 6,
      timezone: 'Asia/Tashkent',
      recallSendHourLocal: 10,
      maxDiscountPercent: 30,
      noShowStrikeThreshold: 3,
      notificationSettings: null,
      integrationSettings: null,
      createdAt: new Date('2026-06-12T10:00:00.000Z'),
      updatedAt: new Date('2026-06-12T11:00:00.000Z'),
    };
    expect(toTenantSettingsDto(row).maxDiscountPercent).toBe(30);
  });

  test('CLI-379/400: integration credentials are masked, never raw', () => {
    const row = {
      id: 'id-1',
      tenantId: 't-1',
      vertical: 'dental',
      reminderLeadHours: 24,
      currency: 'UZS',
      onboardingDismissedAt: null,
      defaultRecallIntervalMonths: 6,
      timezone: 'Asia/Tashkent',
      recallSendHourLocal: 10,
      maxDiscountPercent: 100,
      noShowStrikeThreshold: 3,
      notificationSettings: null,
      integrationSettings: {
        telegram: { botTokenEnc: encryptSecret('123456:ABCDEFbcd'), botUsername: 'clinicbot' },
        sms: { eskizEmailEnc: encryptSecret('a@b.uz'), eskizPasswordEnc: encryptSecret('pw-xyz') },
      },
      createdAt: new Date('2026-06-12T10:00:00.000Z'),
      updatedAt: new Date('2026-06-12T11:00:00.000Z'),
    };
    const dto = toTenantSettingsDto(row as never);
    expect(dto.integrationSettings.telegram.configured).toBe(true);
    expect(dto.integrationSettings.telegram.hint).toBe('••••Fbcd');
    expect(JSON.stringify(dto)).not.toContain('123456'); // no raw token anywhere
    expect(dto.integrationSettings.sms.configured).toBe(true);
  });
});

describe('toNotificationSettingsDto', () => {
  test('merges stored partial over defaults', () => {
    expect(toNotificationSettingsDto({ recallSms: false })).toEqual({
      appointmentReminder: true,
      recallSms: false,
      paymentReceipt: false,
    });
  });
});

describe('mergeNotificationSettings', () => {
  test('patch overrides only given toggle, keeps the rest', () => {
    const stored = { appointmentReminder: false, recallSms: true, paymentReceipt: true };
    expect(mergeNotificationSettings(stored, { paymentReceipt: false })).toEqual({
      appointmentReminder: false,
      recallSms: true,
      paymentReceipt: false,
    });
  });

  test('null stored → defaults plus patch', () => {
    expect(mergeNotificationSettings(null, { appointmentReminder: false })).toEqual({
      appointmentReminder: false,
      recallSms: true,
      paymentReceipt: false,
    });
  });
});
