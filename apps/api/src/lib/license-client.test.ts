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
// `fingerprintImpl` — testdan-testga almashtiriladigan ilgak: `mock.module`
// jarayonga bir marta ro'yxatdan o'tadi, shuning uchun uni qayta chaqirish
// o'rniga ichkaridagi implementatsiyani almashtiramiz (default xulq — barcha
// mavjud testlar uchun o'zgarishsiz sobit fingerprint).
let fingerprintImpl = async (): Promise<string> => 'abc123fingerprint';

// FX-88 — `verifyReset` `.lic`ni o'qiydi; timeout testi uchun almashtiriladi.
let readLicenseImpl: typeof realLicense.readLicense = realLicense.readLicense;

mock.module('./license', () => ({
  ...realLicense,
  getFingerprint: async () => fingerprintImpl(),
  readLicense: async () => readLicenseImpl(),
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
  const originalFingerprint = fingerprintImpl;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    // Keyingi describe'lar (sendHeartbeat) sobit fingerprint'ni kutadi
    fingerprintImpl = originalFingerprint;
  });

  test('Supervisor /v1/provisioned ga licenseKey va fingerprint yuboradi', async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { markProvisioned } = await import('./license-client');
    await markProvisioned('KEY-1', true);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/provisioned'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          licenseKey: 'KEY-1',
          fingerprint: 'abc123fingerprint',
          applied: true,
        }),
      }),
    );
  });

  // Idempotent skip — Supervisor vaqtinchalik parolni SAQLASHI kerak, ya'ni
  // `applied` bayrog'i haqiqatan uzatilishi shart (aks holda default `true`
  // qo'llanib parol o'chib ketardi).
  test('applied:false uzatiladi — skip holatida parol saqlanishi uchun', async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { markProvisioned } = await import('./license-client');
    await markProvisioned('KEY-1', false);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v1/provisioned'),
      expect.objectContaining({
        body: JSON.stringify({
          licenseKey: 'KEY-1',
          fingerprint: 'abc123fingerprint',
          applied: false,
        }),
      }),
    );
  });

  test('tarmoq xatosida throw qilmaydi', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const { markProvisioned } = await import('./license-client');
    await expect(markProvisioned('KEY-1', true)).resolves.toBeUndefined();
  });

  test('Supervisor 500 qaytarsa ham throw qilmaydi', async () => {
    globalThis.fetch = mock(
      async () =>
        new Response(JSON.stringify({ error: { code: 'SERVER_ERROR' } }), { status: 500 }),
    ) as unknown as typeof fetch;

    const { markProvisioned } = await import('./license-client');
    await expect(markProvisioned('KEY-1', true)).resolves.toBeUndefined();
  });

  // JSDoc «fingerprint hisoblab bo'lmasligi (VM/konteyner) throw QILMAYDI»
  // va'dasi — `getFingerprint()` chaqiruvi ham try ichida qolishini qulflaydi.
  test("fingerprint hisoblanmasa throw qilmaydi va so'rov yubormaydi", async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    fingerprintImpl = async () => {
      throw new Error('FINGERPRINT_UNAVAILABLE');
    };

    const { markProvisioned } = await import('./license-client');
    await expect(markProvisioned('KEY-1', true)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
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

// FX-88 — Supervisor so'rovlarida timeout. Javob bermaydigan Supervisor
// «Qayta tekshirish»/aktivatsiya/parol-tiklashni cheksiz osib qo'ymasligi kerak.
// `fetch` mock'i «kech javob beradigan Supervisor»: `signal` abort bo'lsa rad
// etadi, aks holda faqat 1 s dan keyin muvaffaqiyatli javob beradi. Timeout
// bo'lmasa chaqiruv o'sha kech javobni qabul qilib, test yiqiladi.
describe("Supervisor so'rov timeout (FX-88)", () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = process.env.SUPERVISOR_TIMEOUT_MS;

  const hangingFetch = () =>
    mock(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          const late = setTimeout(
            () => resolve(new Response(JSON.stringify({ late: true }), { status: 200 })),
            1000,
          );
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(late);
            reject(init.signal?.reason);
          });
        }),
    );

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalTimeout === undefined) delete process.env.SUPERVISOR_TIMEOUT_MS;
    else process.env.SUPERVISOR_TIMEOUT_MS = originalTimeout;
  });

  test('activateLicense javob kelmasa SUPERVISOR_UNREACHABLE bilan tugaydi', async () => {
    process.env.SUPERVISOR_TIMEOUT_MS = '50';
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const { activateLicense } = await import('./license-client');
    await expect(activateLicense('KEY-1')).rejects.toThrow('SUPERVISOR_UNREACHABLE');
  });

  test('sendHeartbeat javob kelmasa SUPERVISOR_UNREACHABLE bilan tugaydi', async () => {
    process.env.SUPERVISOR_TIMEOUT_MS = '50';
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const { sendHeartbeat } = await import('./license-client');
    await expect(sendHeartbeat('KEY-1')).rejects.toThrow('SUPERVISOR_UNREACHABLE');
  });

  test('tarmoq xatosi ham oddiy SUPERVISOR_UNREACHABLE kodiga aylanadi', async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError('Unable to connect. Is the computer able to access the url?');
    }) as unknown as typeof fetch;
    const { activateLicense } = await import('./license-client');
    await expect(activateLicense('KEY-1')).rejects.toThrow('SUPERVISOR_UNREACHABLE');
  });

  test('markProvisioned javob kelmasa osilmaydi', async () => {
    process.env.SUPERVISOR_TIMEOUT_MS = '50';
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const { markProvisioned } = await import('./license-client');
    const started = performance.now();
    await expect(markProvisioned('KEY-1', true)).resolves.toBeUndefined();
    // Kech javobni (1 s) kutmasdan timeout'da tugashi kerak.
    expect(performance.now() - started).toBeLessThan(500);
  });

  test('verifyReset javob kelmasa osilmaydi va ok:false qaytaradi', async () => {
    process.env.SUPERVISOR_TIMEOUT_MS = '50';
    globalThis.fetch = hangingFetch() as unknown as typeof fetch;
    const { verifyReset } = await import('./license-client');
    const started = performance.now();
    readLicenseImpl = async () =>
      ({ licenseKey: 'KEY-1' }) as Awaited<ReturnType<typeof realLicense.readLicense>>;
    try {
      await expect(verifyReset('AAAAA-BBBBB-CCCCC')).resolves.toEqual({ ok: false });
    } finally {
      readLicenseImpl = realLicense.readLicense;
    }
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(performance.now() - started).toBeLessThan(500);
  });
});
