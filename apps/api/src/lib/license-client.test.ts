import { afterEach, describe, expect, mock, test } from 'bun:test';
import * as realLicense from './license';

// './license' mock qilinadi — mock.module BEFORE any dynamic import of
// './license-client' resolves it (bun mock.module must be registered up
// front). `mock.module` bir jarayonga GLOBAL — agar faqat `getFingerprint`ni
// export qilsak, boshqa test fayli (masalan license.test.ts) `./license`ni
// import qilganda `writeLicense`/`readLicense`/`isLicenseValid` `undefined`
// bo'lib qoladi (fayllar tartibiga bog'liq, racy). Haqiqiy modulni spread
// qilib faqat kerakli funksiyani override qilamiz — qolganlari real bo'lib
// qoladi.
mock.module('./license', () => ({
  ...realLicense,
  getFingerprint: async () => 'abc123fingerprint',
}));

describe('activateLicense', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('calls Supervisor /v1/activate and returns LicenseData', async () => {
    const mockData = {
      licenseKey: 'KEY-123',
      clinicId: 'clinic-1',
      modules: ['patients', 'appointments', 'cashier'],
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      signature: 'rsa-sig',
    };
    const fetchMock = mock(async () => new Response(JSON.stringify(mockData), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { activateLicense } = await import('./license-client');
    const result = await activateLicense('KEY-123');

    expect(result.modules).toContain('patients');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/activate'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('throws on invalid license key', async () => {
    const fetchMock = mock(
      async () => new Response(JSON.stringify({ error: { code: 'INVALID_KEY' } }), { status: 403 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { activateLicense } = await import('./license-client');
    await expect(activateLicense('WRONG')).rejects.toThrow('INVALID_KEY');
  });
});

describe('activateLicense — provisioning bloki', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("provisioning blokini va imzoni o'zgarishsiz qaytaradi", async () => {
    const mockData = {
      licenseKey: 'KEY-1',
      clinicId: 'clinic-1',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      fingerprint: 'abc123fingerprint',
      signature: 'rsa-sig',
      provisioning: {
        licenseKey: 'KEY-1',
        clinicId: 'clinic-1',
        issuedAt: new Date().toISOString(),
        tenantName: 'Test klinika',
        defaultLanguage: 'uz',
        ownerFullName: 'Ali Valiyev',
        ownerPhone: '+998901234567',
        ownerPassword: 'ParolParol123',
        branchName: 'Markaziy filial',
        branchAddress: '',
        branchPhone: '',
      },
      provisioningSignature: 'sig-1',
    };
    const fetchMock = mock(async () => new Response(JSON.stringify(mockData), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { activateLicense } = await import('./license-client');
    const res = await activateLicense('KEY-1');

    expect(res.provisioning?.ownerPhone).toBe('+998901234567');
    expect(res.provisioning?.branchAddress).toBe('');
    expect(res.provisioningSignature).toBe('sig-1');
  });

  test("provisioning bo'lmasa maydonlar undefined bo'ladi", async () => {
    const mockData = {
      licenseKey: 'KEY-1',
      clinicId: 'clinic-1',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      fingerprint: 'abc123fingerprint',
      signature: 'rsa-sig',
    };
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify(mockData), { status: 200 }),
    ) as unknown as typeof fetch;

    const { activateLicense } = await import('./license-client');
    const res = await activateLicense('KEY-1');

    expect(res.provisioning).toBeUndefined();
    expect(res.provisioningSignature).toBeUndefined();
  });
});

describe('markProvisioned', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('Supervisor /v1/provisioned ga licenseKey va fingerprint yuboradi', async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { markProvisioned } = await import('./license-client');
    await markProvisioned('KEY-1');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/provisioned'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ licenseKey: 'KEY-1', fingerprint: 'abc123fingerprint' }),
      }),
    );
  });

  test('tarmoq xatosida throw qilmaydi', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const { markProvisioned } = await import('./license-client');
    await expect(markProvisioned('KEY-1')).resolves.toBeUndefined();
  });

  test('Supervisor 500 qaytarsa ham throw qilmaydi', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ error: { code: 'SERVER_ERROR' } }), { status: 500 }),
    ) as unknown as typeof fetch;

    const { markProvisioned } = await import('./license-client');
    await expect(markProvisioned('KEY-1')).resolves.toBeUndefined();
  });
});

describe('sendHeartbeat', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('calls Supervisor /v1/heartbeat and returns LicenseData', async () => {
    const mockData = {
      licenseKey: 'KEY-123',
      clinicId: 'clinic-1',
      modules: ['patients'],
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      gracePeriodDays: 30,
      issuedAt: new Date().toISOString(),
      signature: 'rsa-sig',
    };
    const fetchMock = mock(async () => new Response(JSON.stringify(mockData), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { sendHeartbeat } = await import('./license-client');
    const result = await sendHeartbeat('KEY-123');

    expect(result.modules).toContain('patients');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/heartbeat'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
