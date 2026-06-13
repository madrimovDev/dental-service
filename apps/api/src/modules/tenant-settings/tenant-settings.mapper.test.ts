import { describe, expect, test } from 'bun:test';
import { toTenantSettingsDto } from './tenant-settings.mapper.ts';

describe('toTenantSettingsDto', () => {
  test('maps Date timestamps to ISO strings', () => {
    const row = {
      id: 'id-1',
      tenantId: 't-1',
      vertical: 'dental',
      reminderLeadHours: 24,
      currency: 'UZS',
      onboardingDismissedAt: null,
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
      createdAt: new Date('2026-06-12T10:00:00.000Z'),
      updatedAt: new Date('2026-06-12T11:00:00.000Z'),
    };
    const dto = toTenantSettingsDto(row);
    expect(dto.onboardingDismissedAt).toBe('2026-06-13T08:30:00.000Z');
  });
});
