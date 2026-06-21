# Observability runbook — dental-service

Three signals: **logs** (pino), **metrics** (Prometheus), **errors** (Sentry).

## Logs

The api + worker emit structured JSON via pino to **stdout**. Do not write log
files inside containers — let the container runtime collect stdout and a shipper
forward it.

- **Format:** JSON; each request carries a `requestId` (request-id middleware).
- **Level:** `LOG_LEVEL` env (`info` in prod). `pino-pretty` is dev-only.
- **Shipping options:**
  - Docker: a logging driver (`json-file` + Promtail, `awslogs`, `gcplogs`,
    `fluentd`) → Loki / CloudWatch / Stackdriver / Datadog.
  - Kubernetes: node-level Promtail/Fluent Bit DaemonSet → Loki/Elasticsearch.
- **PII caution:** medical data. Never log request bodies / patient fields; the
  app logs errors + `requestId`, not record contents. Keep it that way.

## Metrics

`GET /metrics` (Prometheus exposition, text/plain) exposes default process
metrics (CPU, memory, event loop, GC, handles).

- **Scrape:** point Prometheus at `api:8001/metrics` on the internal network.
  ```yaml
  scrape_configs:
    - job_name: dental-api
      static_configs: [{ targets: ['api:8001'] }]
  ```
- **Do NOT expose publicly** — the edge Caddyfile only routes `/api/*` + the SPA,
  so `/metrics` is not reachable from the internet through it. If you scrape
  across hosts, put it behind an auth layer / mTLS.
- **Liveness/readiness:** use `GET /api/health` (DB-checked) for orchestrator
  probes, not `/metrics`.

## Errors (Sentry)

Set `SENTRY_DSN` to enable. Unset = NoOp (zero overhead). Initialized once per
process (`initSentry('api')` in index.ts, `initSentry('worker')` in worker.ts);
each tags events with its `component`. Only genuine unhandled 5xx errors are
captured (`captureException` in the error handler) — handled `HTTPException` /
`ZodError` (4xx) are not reported.

- Set `environment` automatically from `NODE_ENV`.
- Tracing is off by default (`tracesSampleRate: 0`); raise it deliberately if you
  later need performance traces.

## Alerting (suggested starting points)

- `up{job="dental-api"} == 0` for >1m → API down.
- `/api/health` non-200 → DB connectivity.
- High `process_resident_memory_bytes` trend → leak / sizing.
- Sentry error-rate spike → new release regression.
