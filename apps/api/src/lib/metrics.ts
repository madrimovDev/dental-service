/**
 * Prometheus metrics (CLI-238 / D7).
 *
 * Exposes process + default Node/Bun metrics (CPU, memory, event loop, GC) via a
 * single registry. Mounted at GET /metrics (public, text/plain) — keep it on the
 * internal network or behind edge auth; do NOT expose it on the open internet.
 */
import { collectDefaultMetrics, Registry } from 'prom-client';

export const metricsRegistry = new Registry();

// Default process metrics, registered once at module load.
collectDefaultMetrics({ register: metricsRegistry });

/** Render the metrics exposition format. */
export async function renderMetrics(): Promise<string> {
  return metricsRegistry.metrics();
}

export const METRICS_CONTENT_TYPE = metricsRegistry.contentType;
