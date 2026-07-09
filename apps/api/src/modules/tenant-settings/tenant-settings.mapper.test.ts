import { describe, expect, test } from 'bun:test';
import {
  mergeIntegrationSettings,
  mergeNotificationSettings,
  toIntegrationSettingsDto,
  toNotificationSettingsDto,
  toTenantSettingsDto,
} from './tenant-settings.mapper.ts';

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
      telegram: { enabled: false, botUsername: null },
      eskiz: { enabled: false, sender: null },
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

describe('toIntegrationSettingsDto', () => {
  test('merges stored partial provider over defaults', () => {
    const dto = toIntegrationSettingsDto({
      telegram: { enabled: true, botUsername: '@clinicbot' },
    });
    expect(dto.telegram).toEqual({ enabled: true, botUsername: '@clinicbot' });
    expect(dto.eskiz).toEqual({ enabled: false, sender: null });
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

describe('mergeIntegrationSettings', () => {
  test('partial telegram patch preserves untouched config (botUsername)', () => {
    const stored = {
      telegram: { enabled: false, botUsername: '@clinicbot' },
      eskiz: { enabled: true, sender: 'CLINIC' },
    };
    // Patch only flips telegram.enabled — botUsername and the whole eskiz must survive.
    const merged = mergeIntegrationSettings(stored, { telegram: { enabled: true } });
    expect(merged).toEqual({
      telegram: { enabled: true, botUsername: '@clinicbot' },
      eskiz: { enabled: true, sender: 'CLINIC' },
    });
  });

  test('explicit null clears a config field', () => {
    const stored = {
      telegram: { enabled: true, botUsername: '@old' },
      eskiz: { enabled: false, sender: null },
    };
    const merged = mergeIntegrationSettings(stored, { telegram: { botUsername: null } });
    expect(merged.telegram).toEqual({ enabled: true, botUsername: null });
  });
});
