import { afterAll, describe, expect, mock, test } from 'bun:test';
import * as realLicense from './license';

/**
 * FX-105 (LB-14) — Local Desktop: worker/bot bloki `.lic` holatidan (`getLicenseState`)
 * olinadi, tenant obunasidan emas. SaaS yo'li real DB bilan
 * `tests/integration/fx-105-expired-tenant-no-messaging.test.ts` da.
 * Haqiqiy modul spread qilinadi (mock.module global — boshqa eksportlar saqlansin).
 */
let licenseState: string | Error = 'active';
mock.module('./license', () => ({
  ...realLicense,
  getLicenseState: async () => {
    if (licenseState instanceof Error) throw licenseState;
    return { state: licenseState, expiresAt: null, graceEndsAt: null, daysLeft: null };
  },
}));

const { isTenantServiceBlocked } = await import('./subscription');
const saved = process.env.DENTAL_LOCAL_DESKTOP;
afterAll(() => {
  if (saved === undefined) delete process.env.DENTAL_LOCAL_DESKTOP;
  else process.env.DENTAL_LOCAL_DESKTOP = saved;
});

describe('isTenantServiceBlocked (desktop)', () => {
  const tenantId = '00000000-0000-0000-0000-000000000105';
  test('.lic expired → bloklanadi', async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    licenseState = 'expired';
    expect(await isTenantServiceBlocked(tenantId)).toBe(true);
  });
  test('grace / active → bloklanmaydi', async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    for (const s of ['grace', 'expiring', 'active']) {
      licenseState = s;
      expect(await isTenantServiceBlocked(tenantId)).toBe(false);
    }
  });
  test('holat o`qishda xato → fail-open (worker to`xtamaydi)', async () => {
    process.env.DENTAL_LOCAL_DESKTOP = 'true';
    licenseState = new Error('disk');
    expect(await isTenantServiceBlocked(tenantId)).toBe(false);
  });
});
