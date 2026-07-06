import { describe, expect, mock, test } from 'bun:test';
import type { LicenseData } from './license';

const fakeLog = { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) };

const makeLicense = (): LicenseData => ({
  licenseKey: 'CLI-387-KEY',
  clinicId: 'clinic-387',
  modules: ['patients'],
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  gracePeriodDays: 30,
  issuedAt: new Date().toISOString(),
  signature: 'sig',
});

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
      log: fakeLog,
    });

    expect(writeLicense).toHaveBeenCalledWith(fresh);
  });

  test('sendHeartbeat rejects with INVALID_KEY (Supervisor deactivated the clinic) -> invalidates the cached license', async () => {
    const { runLicenseHeartbeatCheck } = await import('./license-heartbeat-scheduler');
    const invalidateLicense = mock(async () => {});

    await runLicenseHeartbeatCheck({
      readLicense: async () => makeLicense(),
      writeLicense: mock(async () => {}),
      invalidateLicense,
      sendHeartbeat: async () => {
        throw new Error('INVALID_KEY');
      },
      log: fakeLog,
    });

    expect(invalidateLicense).toHaveBeenCalledTimes(1);
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
      log: fakeLog,
    });

    expect(invalidateLicense).not.toHaveBeenCalled();
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
