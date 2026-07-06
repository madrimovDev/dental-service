# CLI-387 — License heartbeat scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/api/src/lib/license-client.ts`'s `sendHeartbeat(licenseKey: string): Promise<LicenseData>` is exported but never called in production code, so `apps/supervisor-api`'s `PATCH /:id/deactivate` (`isActive:false`) has zero real effect on an already-activated Local Desktop clinic — its cached `.lic` is only re-validated locally (signature + `expiresAt + gracePeriodDays`, `apps/api/src/lib/license.ts` `getActiveModules()`), never re-checked against the Supervisor. Add a periodic (every 4h) background check in the `apps/api` process that calls `sendHeartbeat()`; on a real Supervisor-confirmed deactivation (`Error('INVALID_KEY')`, per `apps/supervisor-api/src/modules/licenses/licenses.service.ts:49-58`), delete the cached `.lic` file so `requireModule`/`requireModuleInDesktop` gating closes on the very next request (`getActiveModules()` re-reads the file every call, no in-memory cache to bust).

**Architecture:** Lives entirely in `apps/api` (NOT `apps/desktop`) — `license.ts`/`license-client.ts` (fingerprint, `.lic` read/write, RSA signature verify, outbound Supervisor `fetch`) are already `apps/api` code, and `apps/api/src/routes/activate.ts` already makes an outbound Supervisor `fetch` from this same process (`activateLicense()`), so this reuses an established path. `api.exe` is also the one process that runs continuously on the clinic's server PC (`apps/desktop/src/process-manager.ts` `spawnApi()`); Electron's main process is a thin supervisor/tray/discovery layer with no license logic and, on client-role PCs, no `.lic` file at all. New file `apps/api/src/lib/license-heartbeat-scheduler.ts` follows the existing `apps/desktop/src/client-reconnect.ts` DI pattern (injectable `scheduleInterval`/`clearScheduledInterval`, not raw `setInterval`/`clearInterval`) — deliberately NOT BullMQ (unlike `apps/api/src/lib/recall-scheduler.ts`), because this is a single global per-install concern, not a tenant-scoped queue job (see spec §3). Wired into `apps/api/src/index.ts` using the same `env.NODE_ENV !== 'test' && <gate>` boot pattern already used for `startReminderWorker`/`startRecallWorker`, gated on `env.WEB_DIST_DIR` (the existing Local Desktop signal, same one `requireModuleInDesktop` uses) so cloud/dev/CI deployments — which never write a `.lic` — never run this.

**Tech Stack:** Bun (`bun:test`), Hono, `apps/api/src/lib/license-client.ts` (`sendHeartbeat`), `apps/api/src/lib/license.ts` (`readLicense`/`writeLicense`/`getActiveModules`/`isLicenseValid`).

## Global Constraints

- Network errors during heartbeat (fetch reject, timeout, DNS failure) must NOT invalidate the cached `.lic` — an offline clinic keeps working off the locally cached signature+expiry+`gracePeriodDays` check until grace actually expires. Only an explicit `Error('INVALID_KEY')` from `sendHeartbeat()` (Supervisor confirming `isActive: false`) triggers invalidation.
- `FINGERPRINT_MISMATCH` is explicitly OUT of scope for this ticket (spec §5, holat 2) — it signals an admin `reactivate`-to-a-different-machine scenario, not deactivation, and in practice can't even fire here because a fingerprint-mismatched machine already fails to `readLicense()` (AES key IS the fingerprint) before `sendHeartbeat()` is ever called. Do not fold it into the same invalidation branch as `INVALID_KEY`.
- `apps/desktop/src/*` is NOT modified by this plan — see spec §2 for the full justification (scheduling belongs in `apps/api`, not Electron).
- Every non-`INVALID_KEY` heartbeat failure (`SUPERVISOR_ERROR`, `FINGERPRINT_UNAVAILABLE`, `FINGERPRINT_MISMATCH`, thrown network errors) is logged and otherwise a no-op — do not add retry/backoff logic beyond "try again on the next scheduled tick" (no scope creep beyond the DoD).

---

### Task 1: `invalidateLicense()` in `license.ts`

**Files:**
- Modify: `apps/api/src/lib/license.ts` (add export, after `getActiveModules` at line 94)
- Test: `apps/api/src/lib/license.test.ts` (new `describe('invalidateLicense')` block)

**Interfaces:**
- Produces: `export const invalidateLicense = async (): Promise<void>`
- Consumes: `getLicensePath()` (existing, same file, line 26)

- [ ] **Step 1: Write the failing test**

  Add to `apps/api/src/lib/license.test.ts` (after the existing `describe('writeLicense + readLicense', ...)` block, using the same `tmpDir`/`LICENSE_PATH` setup already at the top of the file):

  ```ts
  describe('invalidateLicense', () => {
    test('deletes the cached .lic file so readLicense() returns null afterward', async () => {
      const { writeLicense, readLicense, invalidateLicense } = await import('./license');
      const data = {
        licenseKey: 'CLI-387-KEY',
        clinicId: 'clinic-387',
        modules: ['patients'],
        expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        gracePeriodDays: 30,
        issuedAt: new Date().toISOString(),
        signature: 'mock-signature',
      };
      await writeLicense(data);
      expect(await readLicense()).not.toBeNull();

      await invalidateLicense();

      expect(await readLicense()).toBeNull();
    });

    test('no-ops (does not throw) if the .lic file does not exist', async () => {
      const { invalidateLicense } = await import('./license');
      await invalidateLicense(); // already deleted by the previous test, or never existed
      await invalidateLicense(); // calling twice must still not throw
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/api && bun test --env-file=../../.env license.test.ts
  ```
  Expected: fails with `invalidateLicense is not a function` / `undefined is not a function` (not yet exported).

- [ ] **Step 3: Write minimal implementation**

  In `apps/api/src/lib/license.ts`, add `unlink` to the existing `node:fs/promises` import (line 2) and append after `getActiveModules` (end of file, after line 94):

  ```ts
  import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
  ```

  ```ts
  /**
   * `.lic` faylni o'chiradi (CLI-387 — heartbeat Supervisor'dan `INVALID_KEY`
   * (deaktivatsiya) qaytarganda chaqiriladi). `getActiveModules()` faylni HAR
   * chaqiruvda qayta o'qiydi (cache yo'q) — shuning uchun bu yetarli: keyingi
   * `requireModule` tekshiruvi darhol `LICENSE_NOT_FOUND` qaytaradi, hech
   * qanday qo'shimcha invalidation-signal yoki restart kerak emas.
   */
  export const invalidateLicense = async (): Promise<void> => {
    try {
      await unlink(getLicensePath());
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  };
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/api && bun test --env-file=../../.env license.test.ts
  ```

- [ ] **Step 5: Commit**

---

### Task 2: `license-heartbeat-scheduler.ts` — the check + the interval

**Files:**
- Create: `apps/api/src/lib/license-heartbeat-scheduler.ts`
- Test: `apps/api/src/lib/license-heartbeat-scheduler.test.ts`

**Interfaces:**
- Consumes: `sendHeartbeat(licenseKey: string): Promise<LicenseData>` (`./license-client.ts`, throws `Error(code)` on non-2xx, `code` one of `'INVALID_KEY' | 'FINGERPRINT_MISMATCH' | 'SUPERVISOR_ERROR'`); `readLicense(): Promise<LicenseData | null>`, `writeLicense(data: LicenseData): Promise<void>`, `invalidateLicense(): Promise<void>` (`./license.ts`, `LicenseData` shape: `{ licenseKey, clinicId, modules: string[], expiresAt, gracePeriodDays, issuedAt, signature }`)
- Produces: `runLicenseHeartbeatCheck(deps): Promise<void>`, `startLicenseHeartbeatScheduler(deps?): () => void`, `FOUR_HOURS_MS: number`

- [ ] **Step 1: Write the failing test**

  Create `apps/api/src/lib/license-heartbeat-scheduler.test.ts`:

  ```ts
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
      let scheduledFn: (() => void) | null = null;
      const scheduleInterval = mock((fn: () => void, _ms: number) => {
        scheduledFn = fn;
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

      scheduledFn?.();
      expect(runCheck).toHaveBeenCalledTimes(2); // one interval tick

      stop();
      expect(clearScheduledInterval).toHaveBeenCalledWith('fake-handle');
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/api && bun test --env-file=../../.env license-heartbeat-scheduler.test.ts
  ```
  Expected: fails — module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

  Create `apps/api/src/lib/license-heartbeat-scheduler.ts`:

  ```ts
  import { invalidateLicense, readLicense, writeLicense, type LicenseData } from './license.ts';
  import { sendHeartbeat } from './license-client.ts';
  import { logger } from './logger.ts';

  // `Pick<typeof logger, ...>` instead of a hand-written interface — the real
  // pino `logger` types its `info`/`warn`/`error` first param as `object`
  // (LogFn overloads), not `unknown`; a hand-written `(obj: unknown) => void`
  // signature would NOT be assignable from it (contravariant param under
  // strictFunctionTypes) and would fail typecheck when the real logger is
  // passed in `startLicenseHeartbeatScheduler`'s default `runCheck`. `Pick`
  // guarantees the real logger satisfies it, and the test's plain
  // `{ info: mock(() => {}), ... }` fakes still satisfy it too (a `() => void`
  // is assignable to any of pino's overloaded `LogFn` signatures).
  export type HeartbeatLogger = Pick<typeof logger, 'info' | 'warn' | 'error'>;

  export interface RunHeartbeatCheckDeps {
    readLicense: () => Promise<LicenseData | null>;
    writeLicense: (data: LicenseData) => Promise<void>;
    invalidateLicense: () => Promise<void>;
    sendHeartbeat: (licenseKey: string) => Promise<LicenseData>;
    log: HeartbeatLogger;
  }

  /**
   * Bitta heartbeat tekshiruvi (CLI-387). To'liq injectable — Postgres/Redis/
   * haqiqiy Supervisor'siz unit-testable.
   *
   * - `.lic` yo'q (hali faollashtirilmagan YOKI cloud/dev deployment) → no-op.
   * - Muvaffaqiyatli (200) → Supervisor yangi imzolangan `LicenseData` qaytaradi
   *   (activate bilan bir xil shakl) → cache yangilanadi (`writeLicense`).
   * - `INVALID_KEY` (Supervisor `isActive:false` topdi — deaktivatsiya) →
   *   `.lic` invalidatsiya qilinadi, `getActiveModules()` keyingi chaqiruvda
   *   darhol `[]` qaytaradi (fayl cache qilinmaydi, spec §5).
   * - Boshqa har qanday xato (tarmoq, `FINGERPRINT_MISMATCH`,
   *   `SUPERVISOR_ERROR`, `FINGERPRINT_UNAVAILABLE`) → faqat log, `.lic`
   *   tegilmaydi (offline-resilience global constraint, spec §6).
   */
  export const runLicenseHeartbeatCheck = async (deps: RunHeartbeatCheckDeps): Promise<void> => {
    const lic = await deps.readLicense();
    if (!lic) return;

    try {
      const fresh = await deps.sendHeartbeat(lic.licenseKey);
      await deps.writeLicense(fresh);
      deps.log.info({ clinicId: fresh.clinicId }, 'License heartbeat OK — cached .lic refreshed');
    } catch (err) {
      const code = err instanceof Error ? err.message : 'UNKNOWN';
      if (code === 'INVALID_KEY') {
        await deps.invalidateLicense();
        deps.log.warn(
          { code },
          'License heartbeat: Supervisor reports deactivated (INVALID_KEY) — .lic invalidated',
        );
        return;
      }
      // Transient (network) or out-of-scope (FINGERPRINT_MISMATCH — see spec §5) —
      // keep serving off the locally cached signature+expiry+grace check.
      deps.log.warn({ code }, 'License heartbeat failed (non-fatal) — keeping cached license');
    }
  };

  export const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

  export interface StartHeartbeatSchedulerDeps {
    intervalMs?: number;
    scheduleInterval?: (fn: () => void, ms: number) => unknown;
    clearScheduledInterval?: (handle: unknown) => void;
    runCheck?: () => Promise<void>;
  }

  /**
   * Davriy heartbeat sikli (CLI-387) — `client-reconnect.ts` DI naqshi
   * takrorlanadi (`scheduleInterval`/`clearScheduledInterval` inject
   * qilinadi, `setInterval`/`clearInterval` to'g'ridan-to'g'ri emas —
   * testlanuvchanlik uchun). Boot'da darhol bir marta ham ishga tushiriladi
   * (server qayta ko'tarilganda 4 soat kutmasdan bekor qilingan litsenziya
   * aniqlanishi uchun), so'ng har `intervalMs`da.
   */
  export const startLicenseHeartbeatScheduler = (
    deps: StartHeartbeatSchedulerDeps = {},
  ): (() => void) => {
    const {
      intervalMs = FOUR_HOURS_MS,
      scheduleInterval = (fn, ms) => setInterval(fn, ms),
      clearScheduledInterval = (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
      runCheck = () =>
        runLicenseHeartbeatCheck({
          readLicense,
          writeLicense,
          invalidateLicense,
          sendHeartbeat,
          log: logger,
        }),
    } = deps;

    void runCheck();
    const handle = scheduleInterval(() => {
      void runCheck();
    }, intervalMs);

    return () => clearScheduledInterval(handle);
  };
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/api && bun test --env-file=../../.env license-heartbeat-scheduler.test.ts
  ```

- [ ] **Step 5: Commit**

---

### Task 3: Wire the scheduler into `apps/api/src/index.ts` boot + shutdown

**Files:**
- Modify: `apps/api/src/index.ts:14-82`
- Modify: `apps/api/src/lib/env-schema.ts` (add `LICENSE_HEARTBEAT_INTERVAL_MS`, near the other `*_MS`/rate-limit numeric fields, e.g. after line 99)
- Test: covered by Task 4's integration test (no isolated unit test for `index.ts` itself — this file has no existing test, matching current convention: it's a thin composition root)

**Interfaces:**
- Consumes: `startLicenseHeartbeatScheduler` (Task 2), `env.WEB_DIST_DIR: string | undefined`, `env.NODE_ENV`, new `env.LICENSE_HEARTBEAT_INTERVAL_MS: number`

- [ ] **Step 1: (no separate failing test — this is a wiring-only change; Task 4's integration test exercises the underlying `runLicenseHeartbeatCheck` chain directly, and this task's correctness is confirmed by `bun run typecheck` + the existing test suite not regressing)**

- [ ] **Step 2: N/A**

- [ ] **Step 3: Write the implementation**

  In `apps/api/src/lib/env-schema.ts`, add near the other rate-limit/timeout numeric fields (after `ACTIVATE_RATE_LIMIT` at line 99):

  ```ts
  // CLI-387 — Local Desktop license heartbeat cadence. Only consulted when
  // WEB_DIST_DIR is set (Local Desktop signal); harmless default elsewhere.
  LICENSE_HEARTBEAT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(4 * 60 * 60 * 1000), // 4 soat
  ```

  In `apps/api/src/index.ts`, add the import alongside the other dynamic imports (after line 23, `startReminderWorker`):

  ```ts
  const { startLicenseHeartbeatScheduler } = await import('./lib/license-heartbeat-scheduler.ts');
  ```

  After the recall scheduler registration block (after line 53, `if (inProcessRecall) await registerRecallScheduler();`), add:

  ```ts
  // CLI-387 — License heartbeat: only relevant for Local Desktop (WEB_DIST_DIR
  // signal, same one requireModuleInDesktop uses — apps/api/src/lib/license-middleware.ts).
  // Cloud/dev/CI never write a .lic file, so this is a no-op there (readLicense()
  // returns null, runLicenseHeartbeatCheck short-circuits — see license-heartbeat-scheduler.ts).
  const stopLicenseHeartbeat =
    env.NODE_ENV !== 'test' && env.WEB_DIST_DIR
      ? startLicenseHeartbeatScheduler({ intervalMs: env.LICENSE_HEARTBEAT_INTERVAL_MS })
      : null;
  ```

  In the `shutdown()` function, add alongside the other worker `.close()` calls (after line 69, `if (inProcessRecall) await inProcessRecall.close();`):

  ```ts
  stopLicenseHeartbeat?.();
  ```

- [ ] **Step 4: Verify with typecheck (no runtime test for this composition-root file)**

  ```bash
  cd apps/api && bun run typecheck
  ```

- [ ] **Step 5: Commit**

---

### Task 4: Integration test — deactivated clinic gets blocked on next heartbeat

**Files:**
- Create: `apps/api/tests/integration/cli-387-license-heartbeat.test.ts`

**Interfaces:**
- Consumes: `writeLicense`, `readLicense`, `invalidateLicense` (`../../src/lib/license.ts`), `requireModule` (`../../src/lib/license-middleware.ts`), `runLicenseHeartbeatCheck` (`../../src/lib/license-heartbeat-scheduler.ts`), `sendHeartbeat` (`../../src/lib/license-client.ts`), `logger` (`../../src/lib/logger.ts`)

This test is hermetic — no Postgres required (unlike `cli-358-module-gating.test.ts`, which needs `createApp()` + DB pool). It builds a minimal `Hono` app with just `requireModule`, and exercises the real `.lic` file + real signature-verification chain (mirroring the `signForTest` pattern already used in `apps/api/src/lib/license.test.ts`), proving the DoD's before→after transition end-to-end.

- [ ] **Step 1: Write the failing test**

  Create `apps/api/tests/integration/cli-387-license-heartbeat.test.ts`:

  ```ts
  /**
   * CLI-387 — proves the DoD end-to-end: an active Local Desktop clinic passes
   * requireModule() gating; once a heartbeat confirms the Supervisor
   * deactivated it (INVALID_KEY), the cached .lic is invalidated and the very
   * next request is blocked — no process restart, no extra signal, because
   * getActiveModules() re-reads the file on every call (see license.ts).
   *
   * Hermetic — no Postgres (unlike cli-358-module-gating.test.ts): builds a
   * bare Hono app around requireModule() directly, and uses a REAL signed
   * .lic file (systeminformation + supervisor-public-key mocked, same pattern
   * as license.test.ts's signForTest helper) so the real readLicense ->
   * isLicenseValid -> getActiveModules -> requireModule chain runs unmodified.
   *
   * Run: cd apps/api && bun test --env-file=../../.env cli-387-license-heartbeat
   */
  import { afterAll, describe, expect, mock, test } from 'bun:test';
  import { createSign, generateKeyPairSync } from 'node:crypto';
  import { mkdtemp, rm } from 'node:fs/promises';
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';
  import { Hono } from 'hono';

  const tmpDir = await mkdtemp(join(tmpdir(), 'cli-387-heartbeat-'));
  process.env.LICENSE_PATH = join(tmpDir, 'license.lic');

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // systeminformation — mock BEFORE any dynamic import of '../../src/lib/license.ts'
  // resolves it (bun mock.module must be registered up front, license.test.ts pattern).
  mock.module('systeminformation', () => {
    const cpu = async () => ({ manufacturer: 'Intel', brand: 'i5' });
    const system = async () => ({ uuid: 'cli-387-uuid', serial: 'cli-387-serial' });
    const networkInterfaces = async () => [
      { iface: 'eth0', mac: 'aa:bb:cc:dd:ee:ff', default: true },
    ];
    return { default: { cpu, system, networkInterfaces }, cpu, system, networkInterfaces };
  });

  const testKeypair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  mock.module('@dental/core/supervisor-public-key', () => ({
    SUPERVISOR_PUBLIC_KEY_PEM: testKeypair.publicKey,
  }));

  const signForTest = (data: object): string => {
    const canonical = JSON.stringify(data, Object.keys(data).sort());
    const sign = createSign('SHA256');
    sign.update(canonical);
    return sign.sign(testKeypair.privateKey, 'hex');
  };

  const { writeLicense, readLicense, invalidateLicense } = await import('../../src/lib/license.ts');
  const { requireModule } = await import('../../src/lib/license-middleware.ts');
  const { runLicenseHeartbeatCheck } = await import(
    '../../src/lib/license-heartbeat-scheduler.ts'
  );
  const { sendHeartbeat } = await import('../../src/lib/license-client.ts');
  const { logger } = await import('../../src/lib/logger.ts');

  const buildApp = () => {
    const app = new Hono();
    app.get('/x', requireModule('patients'), (c) => c.json({ ok: true }));
    return app;
  };

  const activeLicensePayload = (licenseKey: string) => ({
    licenseKey,
    clinicId: 'clinic-387',
    modules: ['patients'],
    expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
    gracePeriodDays: 30,
    issuedAt: new Date().toISOString(),
  });

  describe('CLI-387 — deactivated clinic gets blocked on next heartbeat', () => {
    const originalFetch = globalThis.fetch;
    afterAll(() => {
      globalThis.fetch = originalFetch;
    });

    test('active license passes (200) -> Supervisor heartbeat says INVALID_KEY -> next request 403 LICENSE_NOT_FOUND', async () => {
      const payload = activeLicensePayload('CLI-387-KEY-1');
      await writeLicense({ ...payload, signature: signForTest(payload) });

      const app = buildApp();

      // BEFORE: active license, module allowed.
      const before = await app.request('/x');
      expect(before.status).toBe(200);

      // Supervisor now reports the clinic deactivated (PATCH /:id/deactivate
      // set isActive:false; licenses.service.ts heartbeat() throws INVALID_KEY).
      globalThis.fetch = mock(
        async () =>
          new Response(JSON.stringify({ error: { code: 'INVALID_KEY' } }), { status: 403 }),
      ) as unknown as typeof fetch;

      await runLicenseHeartbeatCheck({
        readLicense,
        writeLicense,
        invalidateLicense,
        sendHeartbeat,
        log: logger,
      });

      // AFTER: .lic invalidated -> getActiveModules() re-reads and finds
      // nothing -> gate closes on the very next request, no restart needed.
      const after = await app.request('/x');
      expect(after.status).toBe(403);
      const body = (await after.json()) as { error: { code: string } };
      expect(body.error.code).toBe('LICENSE_NOT_FOUND');
    });

    test('transient network error during heartbeat does NOT invalidate the cached license (offline resilience)', async () => {
      const payload = activeLicensePayload('CLI-387-KEY-2');
      await writeLicense({ ...payload, signature: signForTest(payload) });

      const app = buildApp();
      expect((await app.request('/x')).status).toBe(200);

      globalThis.fetch = mock(async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch;

      await runLicenseHeartbeatCheck({
        readLicense,
        writeLicense,
        invalidateLicense,
        sendHeartbeat,
        log: logger,
      });

      // Still works — local signature+expiry+grace check is unaffected by
      // the Supervisor being unreachable (Global Constraint).
      expect((await app.request('/x')).status).toBe(200);
    });
  });
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd apps/api && bun test --env-file=../../.env cli-387-license-heartbeat
  ```
  Expected: fails before Tasks 1-2 land (`invalidateLicense`/`runLicenseHeartbeatCheck` don't exist yet). If run AFTER Tasks 1-3 are already implemented, run this test first with a deliberate one-line sabotage (e.g. temporarily make `runLicenseHeartbeatCheck` invalidate on every error, not just `INVALID_KEY`) to confirm the second test actually catches the offline-resilience regression, then revert the sabotage — standard TDD-after-the-fact double-check when tasks are done in order.

- [ ] **Step 3: (implementation already exists from Tasks 1-3 — this task is pure verification)**

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd apps/api && bun test --env-file=../../.env cli-387-license-heartbeat
  ```

- [ ] **Step 5: Commit**

---

## Self-review

- **No placeholders:** every function body, test assertion, and wiring diff above is the literal code to apply, derived from files actually read in full: `license-client.ts` (29 lines), `license.ts` (95 lines), `license-middleware.ts` (89 lines), `activate.ts` (54 lines), `process-manager.ts` (191 lines), `client-reconnect.ts` (50 lines), `discovery.ts` (99 lines), `main.ts` (286 lines), `worker.ts` (61 lines), `recall-worker.ts` (192 lines), `reminder-worker.ts` (72 lines), `index.ts` (83 lines), `recall-scheduler.ts` (28 lines), `licenses.service.ts` (86 lines), `licenses.routes.ts` (49 lines), `license.test.ts` (135 lines), `license-middleware.test.ts` (116 lines), `cli-358-module-gating.test.ts` (267 lines).
- **Ticket description discrepancy caught and resolved:** the ticket says "heartbeat response says isActive:false" — the actual `licenses.service.ts` contract has no such field; it throws HTTP 403 with `error.code: 'INVALID_KEY'`. This plan is written against the verified real contract, not the ticket's paraphrase (spec §1, §5).
- **FINGERPRINT_MISMATCH deliberately excluded from invalidation** (Task 2, two dedicated tests: one for `INVALID_KEY` invalidating, one for `FINGERPRINT_MISMATCH` NOT invalidating) — traced why it's realistically unreachable in the deactivation flow (a fingerprint-drifted machine can't even decrypt its own `.lic` to get a `licenseKey` to heartbeat with) and is a distinct feature (admin reassignment) outside this ticket's DoD. Not silently folded into the same branch.
- **Desktop vs api decision has three independent supporting facts**, not just an assertion: (1) license/fingerprint code already lives in `apps/api`, (2) the outbound Supervisor `fetch` path already exists in `apps/api` (`activate.ts`), (3) `api.exe` — not Electron — is the process that runs continuously on the clinic's server PC. `apps/desktop` is untouched by this plan.
- **BullMQ-vs-setInterval choice is justified explicitly** (spec §3, plan Architecture paragraph) so a reviewer familiar with `recall-scheduler.ts`'s BullMQ precedent doesn't bounce this as "should use the queue" — the distinguishing fact is tenant-scoped-many-jobs (recall) vs. one-global-check (license).
- **Global constraint (offline resilience) has a dedicated regression test** in both Task 2 (unit, injected fake network-error) and Task 4 (integration, real mocked `fetch` throw) — not just asserted in prose.
- **Interval choice (4h) is reasoned from the actual `gracePeriodDays` unit** (days, not hours) found in `LicenseData`/`isLicenseValid()`, not picked arbitrarily; made env-overridable (`LICENSE_HEARTBEAT_INTERVAL_MS`) following the codebase's existing `*_MS`/rate-limit numeric-env convention in `env-schema.ts`.
- **`post()`'s missing fetch timeout** (`license-client.ts`) is flagged in the spec (§6) as a known, deliberately-unfixed gap (scope creep), with the mitigating fact recorded (fire-and-forget interval tick, doesn't block subsequent ticks) — not silently ignored, not fixed out of scope.
