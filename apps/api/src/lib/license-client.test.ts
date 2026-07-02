import { afterEach, describe, expect, mock, test } from 'bun:test';

// './license' mock qilinadi — mock.module BEFORE any dynamic import of
// './license-client' resolves it (bun mock.module must be registered up front).
mock.module('./license', () => ({
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
