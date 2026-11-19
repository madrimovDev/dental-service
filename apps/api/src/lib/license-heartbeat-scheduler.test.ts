import { describe, expect, mock, test } from 'bun:test';
import type { LicenseData } from './license';

const fakeLog = { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) };

// FX-07 — `expiresAt` regressiyasi rad etiladi (yangi < joriy). Har chaqiruvda
// `Date.now()` dan hisoblansa, testda avval yaratilgan `fresh` keyin o'qilgan
// "joriy" `.lic`dan millisekundlarga eski bo'lib, yozilmay qolardi — shuning
// uchun muddat modul darajasida bir marta qotiriladi.
const EXPIRES_AT = new Date(Date.now() + 86400000).toISOString();

const makeLicense = (): LicenseData => ({
  licenseKey: 'CLI-387-KEY',
  clinicId: 'clinic-387',
  modules: ['patients'],
  expiresAt: EXPIRES_AT,
  gracePeriodDays: 30,
  issuedAt: new Date().toISOString(),
  fingerprint: 'test-fp',
  signature: 'sig',
});

// CLI-437 — default anchor no-op deps for tests that don't care about the
// monotonic-anchor advance (existing pre-CLI-437 test cases below).
const noopAnchorDeps = { readAnchor: async () => 0, writeAnchor: mock(async (_ms: number) => {}) };

// FX-06 — fake payloads here are not RSA-signed; tests that exercise the
// post-verification path stub the verifier (real verification is covered by
// tests/integration/fx-06-heartbeat-verify.test.ts).
const acceptAll = async () => true;

describe('runLicenseHeartbeatCheck', () => {
  test('no cached license (not activated yet, or cloud/dev) -> no-op, sendHeartbeat never called', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const sendHeartbeat = mock(async () => makeLicense());
    const invalidateLicense = mock(async () => {});

    await runLicenseHeartbeatCheck({
      readLicense: async () => null,
      writeLicense: mock(async () => {}),
      invalidateLicense,
      sendHeartbeat,
      ...noopAnchorDeps,
      log: fakeLog,
    });

    expect(sendHeartbeat).not.toHaveBeenCalled();
    expect(invalidateLicense).not.toHaveBeenCalled();
  });

  test('successful heartbeat refreshes the cached .lic with the fresh signed LicenseData', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const fresh = makeLicense();
    const writeLicense = mock(async () => {});

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense,
      invalidateLicense: mock(async () => {}),
      sendHeartbeat: async () => fresh,
      ...noopAnchorDeps,
      verifyLicense: acceptAll,
      log: fakeLog,
    });

    expect(writeLicense).toHaveBeenCalledWith(fresh);
  });

  // FX-07 (LA-16) — CLI-387'ning eski xulqi (imzosiz INVALID_KEY → `.lic`
  // o'chadi) ATAYIN o'zgartirildi: imzosiz signal (eski Supervisor, MITM 403,
  // zaxiradan tiklangan Supervisor bazasi) `.lic`ni o'chira olmaydi.
  test.each([
    'INVALID_KEY',
    'UNKNOWN_KEY',
  ])('sendHeartbeat rejects with unsigned %s -> does NOT invalidate the cached license (FX-07)', async (code) => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const invalidateLicense = mock(async () => {});

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense: mock(async () => {}),
      invalidateLicense,
      sendHeartbeat: async () => {
        throw new Error(code);
      },
      ...noopAnchorDeps,
      log: fakeLog,
    });

    expect(invalidateLicense).not.toHaveBeenCalled();
  });

  test('LICENSE_REVOKED whose revocation verifies -> invalidates the cached license (FX-07)', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const invalidateLicense = mock(async () => {});
    const current = makeLicense();
    const revocation = { status: 'revoked', signature: 'sig' };
    const verifyRevocation = mock(async () => true);

    await runLicenseHeartbeatCheck({
      readLicense: async () => current,
      writeLicense: mock(async () => {}),
      invalidateLicense,
      sendHeartbeat: async () => {
        throw Object.assign(new Error('LICENSE_REVOKED'), {
          body: { error: { code: 'LICENSE_REVOKED', revocation } },
        });
      },
      ...noopAnchorDeps,
      verifyRevocation,
      log: fakeLog,
    });

    expect(verifyRevocation).toHaveBeenCalledWith(revocation, current);
    expect(invalidateLicense).toHaveBeenCalledTimes(1);
  });

  test('LICENSE_REVOKED whose revocation fails verification -> does NOT invalidate (FX-07)', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const invalidateLicense = mock(async () => {});

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense: mock(async () => {}),
      invalidateLicense,
      sendHeartbeat: async () => {
        throw new Error('LICENSE_REVOKED');
      },
      ...noopAnchorDeps,
      verifyRevocation: async () => false,
      log: fakeLog,
    });

    expect(invalidateLicense).not.toHaveBeenCalled();
  });

  test('verified heartbeat with an earlier expiresAt does NOT replace the cached .lic (FX-07)', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const writeLicense = mock(async () => {});
    const regressed = {
      ...makeLicense(),
      expiresAt: new Date(Date.parse(EXPIRES_AT) - 86400000).toISOString(),
    };

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense,
      invalidateLicense: mock(async () => {}),
      sendHeartbeat: async () => regressed,
      ...noopAnchorDeps,
      verifyLicense: acceptAll,
      log: fakeLog,
    });

    expect(writeLicense).not.toHaveBeenCalled();
  });

  test('verified heartbeat whose expiresAt is not a date does NOT replace the cached .lic (FX-07 review)', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const writeLicense = mock(async () => {});
    const writeAnchor = mock(async (_ms: number) => {});
    const { expiresAt: _drop, ...noExpiry } = makeLicense();

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense,
      invalidateLicense: mock(async () => {}),
      sendHeartbeat: async () => noExpiry as unknown as LicenseData,
      readAnchor: async () => 0,
      writeAnchor,
      verifyLicense: acceptAll,
      log: fakeLog,
    });

    expect(writeLicense).not.toHaveBeenCalled();
    expect(writeAnchor).not.toHaveBeenCalled();
  });

  test('verified heartbeat for a different licenseKey does NOT replace the cached .lic (FX-07 review)', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const writeLicense = mock(async () => {});
    const other = {
      ...makeLicense(),
      licenseKey: 'OTHER-KEY',
      expiresAt: new Date(Date.parse(EXPIRES_AT) + 86400000 * 365).toISOString(),
    };

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense,
      invalidateLicense: mock(async () => {}),
      sendHeartbeat: async () => other,
      ...noopAnchorDeps,
      verifyLicense: acceptAll,
      log: fakeLog,
    });

    expect(writeLicense).not.toHaveBeenCalled();
  });

  test('sendHeartbeat rejects with FINGERPRINT_MISMATCH -> does NOT invalidate (out of scope, see spec §5)', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const invalidateLicense = mock(async () => {});

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense: mock(async () => {}),
      invalidateLicense,
      sendHeartbeat: async () => {
        throw new Error('FINGERPRINT_MISMATCH');
      },
      ...noopAnchorDeps,
      log: fakeLog,
    });

    expect(invalidateLicense).not.toHaveBeenCalled();
  });

  test('sendHeartbeat rejects with a network error -> does NOT invalidate (offline resilience)', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const invalidateLicense = mock(async () => {});

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense: mock(async () => {}),
      invalidateLicense,
      sendHeartbeat: async () => {
        throw new Error('fetch failed');
      },
      ...noopAnchorDeps,
      log: fakeLog,
    });

    expect(invalidateLicense).not.toHaveBeenCalled();
  });

  test('sendHeartbeat rejects with SUPERVISOR_ERROR (generic 5xx) -> does NOT invalidate', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const invalidateLicense = mock(async () => {});

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense: mock(async () => {}),
      invalidateLicense,
      sendHeartbeat: async () => {
        throw new Error('SUPERVISOR_ERROR');
      },
      ...noopAnchorDeps,
      log: fakeLog,
    });

    expect(invalidateLicense).not.toHaveBeenCalled();
  });

  test('FX-06: response failing verification -> neither .lic nor anchor written, not invalidated', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const writeLicense = mock(async () => {});
    const writeAnchor = mock(async (_ms: number) => {});
    const invalidateLicense = mock(async () => {});

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense,
      invalidateLicense,
      sendHeartbeat: async () => makeLicense(),
      readAnchor: async () => 0,
      writeAnchor,
      verifyLicense: async () => false,
      log: fakeLog,
    });

    expect(writeLicense).not.toHaveBeenCalled();
    expect(writeAnchor).not.toHaveBeenCalled();
    expect(invalidateLicense).not.toHaveBeenCalled();
  });

  // CLI-437 — successful heartbeat re-anchors the monotonic clock to
  // Supervisor's (trusted) server-time `issuedAt`.
  test('successful heartbeat advances the anchor to the fresh issuedAt (server time)', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const fresh = makeLicense(); // issuedAt = now
    const writeAnchor = mock(async (_ms: number) => {});
    const priorAnchorMs = Date.now() - 86400000; // stale anchor, one day old

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense: mock(async () => {}),
      invalidateLicense: mock(async () => {}),
      sendHeartbeat: async () => fresh,
      readAnchor: async () => priorAnchorMs,
      writeAnchor,
      verifyLicense: acceptAll,
      log: fakeLog,
    });

    expect(writeAnchor).toHaveBeenCalledTimes(1);
    const writtenMs = writeAnchor.mock.calls[0]?.[0] as number;
    expect(writtenMs).toBeGreaterThanOrEqual(Date.parse(fresh.issuedAt));
    expect(writtenMs).toBeGreaterThan(priorAnchorMs);
  });
});

describe('startLicenseHeartbeatScheduler', () => {
  test('runs once immediately at boot, then again on each interval tick, and stop() clears the interval', async () => {
    // A mutable container (not a bare `let`) — TS's control-flow narrowing
    // treats a `let (() => void) | null = null` that's only ever reassigned
    // inside a nested closure as staying `null` (narrows to `never` on call)
    // at the outer use site, even though the closure runs synchronously here.
    const captured: { fn: (() => void) | null } = { fn: null };
    const scheduleInterval = mock((fn: () => void, _ms: number) => {
      captured.fn = fn;
      return 'fake-handle';
    });
    const clearScheduledInterval = mock((_handle: unknown) => {});
    const runCheck = mock(async () => {});

    const { startLicenseHeartbeatScheduler } = await import('./license-heartbeat-scheduler');
    const stop = startLicenseHeartbeatScheduler({
      intervalMs: 1000,
      scheduleInterval,
      clearScheduledInterval,
      runCheck,
    });

    expect(runCheck).toHaveBeenCalledTimes(1); // immediate boot-time run

    captured.fn?.();
    expect(runCheck).toHaveBeenCalledTimes(2); // one interval tick

    stop();
    expect(clearScheduledInterval).toHaveBeenCalledWith('fake-handle');
  });
});
