import { describe, expect, it } from 'vitest';
import { settingsKeys } from './settings.keys';

describe('settingsKeys', () => {
  it('scope kalitlari', () => {
    expect(settingsKeys.all).toEqual(['settings']);
    expect(settingsKeys.roles()).toEqual(['settings', 'roles']);
    expect(settingsKeys.role('r1')).toEqual(['settings', 'role', 'r1']);
    expect(settingsKeys.permissions()).toEqual(['settings', 'permissions']);
    expect(settingsKeys.users()).toEqual(['settings', 'users']);
    expect(settingsKeys.branches()).toEqual(['settings', 'branches']);
    expect(settingsKeys.tenant()).toEqual(['settings', 'tenant']);
    expect(settingsKeys.tenantSettings()).toEqual(['tenant-settings']);
  });
});
