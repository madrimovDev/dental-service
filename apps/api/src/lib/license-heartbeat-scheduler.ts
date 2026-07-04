import { invalidateLicense, type LicenseData, readLicense, writeLicense } from './license.ts';
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
