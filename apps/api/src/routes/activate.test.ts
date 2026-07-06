import { describe, expect, mock, test } from 'bun:test';
import { Hono } from 'hono';
import * as realLicense from '../lib/license.ts';
import * as realLicenseClient from '../lib/license-client.ts';

// Mock BEFORE the dynamic import of './activate.ts' resolves it (bun
// mock.module must be registered up front — same pattern as
// license-middleware.test.ts). Both mocks are mutable per-test so each test
// can drive a different Supervisor/writeLicense outcome. `mock.module` is
// GLOBAL to the whole `bun test` process (keyed by resolved path, not the
// specifier string) — spreading the real module and overriding only the one
// function needed keeps `license.test.ts`/`license-client.test.ts`'s own
// real imports intact when the full suite runs in one process.
let activateImpl: (key: string) => Promise<unknown> = async () => ({
  licenseKey: 'AAAAA-BBBBB-CCCCC-DDDDD',
  clinicId: 'clinic-1',
  modules: ['patients', 'appointments'],
  expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
  gracePeriodDays: 30,
  issuedAt: new Date().toISOString(),
  signature: 'sig',
});
let writeLicenseCalls: unknown[] = [];

mock.module('../lib/license-client.ts', () => ({
  ...realLicenseClient,
  activateLicense: (key: string) => activateImpl(key),
}));
mock.module('../lib/license.ts', () => ({
  ...realLicense,
  writeLicense: async (data: unknown) => {
    writeLicenseCalls.push(data);
  },
}));

const { activateRoutes } = await import('./activate.ts');

const post = (app: Hono, body: unknown) =>
  app.request('/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('activateRoutes', () => {
  test('valid licenseKey -> writes license, returns modules+expiresAt', async () => {
    writeLicenseCalls = [];
    const app = new Hono();
    app.route('/', activateRoutes());

    const res = await post(app, { licenseKey: 'AAAAA-BBBBB-CCCCC-DDDDD' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: true; data: { modules: string[] } };
    expect(body.success).toBe(true);
    expect(body.data.modules).toEqual(['patients', 'appointments']);
    expect(writeLicenseCalls).toHaveLength(1);
  });

  test('missing licenseKey -> 400, license never written', async () => {
    writeLicenseCalls = [];
    const app = new Hono();
    app.route('/', activateRoutes());

    const res = await post(app, {});

    expect(res.status).toBe(400);
    expect(writeLicenseCalls).toHaveLength(0);
  });

  test('Supervisor rejects key (INVALID_KEY) -> 403, license not written', async () => {
    activateImpl = async () => {
      throw new Error('INVALID_KEY');
    };
    writeLicenseCalls = [];
    const app = new Hono();
    app.route('/', activateRoutes());

    const res = await post(app, { licenseKey: 'WRONG-WRONG-WRONG-WRONG' });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_KEY');
    expect(writeLicenseCalls).toHaveLength(0);
  });

  test('fingerprint unavailable (VM/container) -> 500', async () => {
    activateImpl = async () => {
      throw new Error('FINGERPRINT_UNAVAILABLE');
    };
    const app = new Hono();
    app.route('/', activateRoutes());

    const res = await post(app, { licenseKey: 'AAAAA-BBBBB-CCCCC-DDDDD' });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FINGERPRINT_UNAVAILABLE');
  });
});
