/**
 * Sentry error tracking (CLI-238 / D7) — guarded by env, NoOp pattern.
 *
 * When `SENTRY_DSN` is unset, every export here is a cheap no-op (mirrors the
 * NoOpFiscalProvider / SMS channel pattern). When set, errors are captured.
 * Init is called once per process from index.ts (api) and worker.ts (worker).
 */
import * as Sentry from '@sentry/node';
import { env } from './env.ts';

let enabled = false;

/** Initialize Sentry. No-op when SENTRY_DSN is unset. Call once at process boot. */
export function initSentry(component: 'api' | 'worker'): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Conservative defaults — errors only, no perf tracing unless tuned later.
    tracesSampleRate: 0,
    initialScope: { tags: { component } },
  });
  enabled = true;
}

/** Capture an exception. No-op when Sentry is disabled. */
export function captureException(err: unknown): void {
  if (!enabled) return;
  Sentry.captureException(err);
}

/** Whether Sentry is active (DSN was provided). */
export function isSentryEnabled(): boolean {
  return enabled;
}
