# Deployment runbook — dental-service

> Scope: how to build, configure, migrate, and run dental-service in production.
> Stack: Bun (api + worker), static SPA (web), Postgres 16 + RLS, Redis, MinIO,
> Caddy (edge TLS). Orchestrated by `infra/docker-compose.prod.yml`.

## 1. Images

Build from the **repo root** (Bun workspaces need the root lockfile + all
workspace packages):

```bash
docker build -f apps/api/Dockerfile -t dental-api:<tag> .
docker build -f apps/web/Dockerfile \
  --build-arg VITE_API_BASE_URL="" -t dental-web:<tag> .
```

- The **api** image serves both the API server (default CMD) and the BullMQ
  worker (CMD overridden to `bun run src/worker.ts` by the `worker` service).
- `VITE_API_BASE_URL` is **build-time** — Vite inlines it. Empty = SPA uses a
  relative `/api` path served from the same edge host (no CORS). Rebuild the web
  image to change it.

CI builds + pushes these to GHCR on push to `main` (`.github/workflows/deploy.yml`).

## 2. Secrets / configuration injection

The api/worker read **all** config from process env in prod — there is NO
`.env` file in the image and the prod scripts (`start:prod`, `worker:prod`,
`db:migrate:prod`) do **not** pass `--env-file`.

Inject via one of:

- **Compose (single host):** copy `.env.production.example` to a file OUTSIDE
  the repo (e.g. `/etc/dental/dental.env`, `chmod 600`), fill real secrets, then
  `--env-file /etc/dental/dental.env`. Never commit a filled file.
- **Secret manager (recommended):** store each secret in your manager (AWS
  Secrets Manager / GCP Secret Manager / Vault / Doppler / 1Password Connect)
  and render them into the env at deploy time. The example file is the canonical
  list of required keys.
- **Kubernetes:** a `Secret` mounted as env vars; the example file maps 1:1.

### Required secrets (boot fails fast if missing)
`JWT_SECRET` (>= 32 chars, unique — a `change_me`/placeholder value is REJECTED
at boot when `NODE_ENV=production`, see `apps/api/src/lib/env-schema.ts`),
`POSTGRES_PASSWORD`, `DATABASE_URL`, `DATABASE_ADMIN_URL` (migrate only),
`REDIS_PASSWORD` / `REDIS_URL`, `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`,
`WEB_ORIGIN`, `DOMAIN`, `ACME_EMAIL`. Generate a JWT secret with:

```bash
openssl rand -base64 48
```

## 3. Deploy sequence (single host, compose)

```bash
ENVFILE=/etc/dental/dental.env
C="docker compose -f infra/docker-compose.prod.yml --env-file $ENVFILE"

# 1. Pull/refresh images
$C pull        # or build locally: $C build

# 2. Bring up datastores first
$C up -d postgres redis minio minio-init

# 3. RELEASE MIGRATION — run once, must succeed before app starts (see §4)
$C run --rm migrate

# 4. Start app + edge
$C up -d api worker web caddy
```

Rolling update: rebuild/pull images, run `migrate`, then `$C up -d` (compose
recreates changed services). The api/worker handle SIGTERM gracefully (drain
in-flight, close DB/Redis/queue) so in-flight requests are not cut.

## 4. Migrations (release step)

`migrate` runs `bun run src/db/migrate.ts` with the **admin** connection
(`DATABASE_ADMIN_URL`): applies Drizzle SQL migrations + idempotent RLS DDL,
tracked in `_rls_migrations`. It is idempotent — safe to re-run. The app runtime
uses the non-superuser `DATABASE_URL` (NOBYPASSRLS) so RLS is always enforced.

Run migrations **before** routing traffic to a new app version. The pipeline
(`deploy.yml`) runs this as an explicit gated step.

## 5. TLS / edge

Caddy (`infra/Caddyfile`) terminates TLS and reverse-proxies `/api/*` to the api
and everything else to the web SPA. It provisions + renews Let's Encrypt certs
automatically for `${DOMAIN}` — ports 80 + 443 must be reachable and DNS must
point at the host. For staging, uncomment the `acme_ca` staging line to avoid LE
rate limits. Cert state persists in the `caddy_data` volume.

## 6. Health + observability

- `GET /api/health` — liveness + DB check (use for load-balancer / orchestrator
  probes).
- `GET /metrics` — Prometheus metrics (process + default). Scrape from your
  Prometheus; do NOT expose publicly (keep behind the internal network or an
  auth layer at the edge).
- Logs: pino structured JSON to stdout. Ship via your container log driver
  (Loki/promtail, CloudWatch, Datadog, etc.). See observability runbook.
- Errors: Sentry when `SENTRY_DSN` is set (no-op otherwise).

## 7. Backup / DR

See [`backup-restore.md`](./backup-restore.md).
