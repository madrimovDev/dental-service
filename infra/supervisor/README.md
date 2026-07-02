# Supervisor VPS deploy

⚠️ This folder deploys ONLY to the vendor's own centrally-hosted Supervisor
VPS (licensing + admin panel for all clinics). It is **never** bundled into a
clinic's dental-service deploy (root `infra/docker-compose.prod.yml` /
`infra/Caddyfile`) — separate stack, separate domain, separate secrets, no
shared service names or network.

## What runs here

- `postgres` — Supervisor's own database (`licenses`, `clinics`, `branches`,
  `admin_users`, `license_events`; see `apps/supervisor-api/src/db/schema.ts`)
- `migrate` — one-shot release step: runs Drizzle migrations, then seeds the
  bootstrap admin user (`apps/supervisor-api/src/db/seed.ts`, idempotent)
- `api` — `@supervisor/api` (Hono), license activate/heartbeat/reactivate +
  admin auth/clinics/module-toggle routes, mounted under `/v1/*`
- `admin` — `@supervisor/admin` (React/Mantine), static-served by Caddy
- `caddy` — public edge: automatic HTTPS, routes `/v1/*` → `api`, everything
  else → `admin`

## First deploy

1. **Generate the RSA keypair (once, ever)** — this signs every license
   response; dental-service instances verify offline against the public key.
   Rotating it invalidates every previously issued license signature, so
   treat it as a long-lived root of trust.

   ```bash
   cd apps/supervisor-api && bun -e "
   const { generateKeyPair } = await import('./src/lib/rsa.ts')
   const { privateKey, publicKey } = generateKeyPair()
   console.log('PRIVATE:', privateKey)
   console.log('PUBLIC:', publicKey)
   "
   ```

   - `privateKey` → `RSA_PRIVATE_KEY` in the VPS `.env.production` (never
     committed, never leaves the VPS secrets store).
   - `publicKey` → copy into `packages/core/supervisor-public-key.ts` (same
     monorepo, plain copy-paste) so dental-service instances can verify
     `.lic` signatures.

2. **Copy the env template** and fill in real secrets on the VPS (not in the
   repo):

   ```bash
   cp .env.production.example .env.production
   # edit .env.production with real values — see file for what each var does
   ```

3. **Build + migrate + start**, from `infra/supervisor/` (build context is
   the repo root, resolved automatically via `context: ../..` in the compose
   file — see `apps/supervisor-api/Dockerfile` / `apps/supervisor-admin/Dockerfile`):

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production build
   docker compose -f docker-compose.prod.yml --env-file .env.production run --rm migrate
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d api admin caddy
   ```

4. **Verify** (see "Qo'lda tekshirish" checklist in the Task 6 brief):
   `POST /v1/admin/auth/login` with `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD`
   returns a JWT; the admin panel loads over HTTPS at `https://${DOMAIN}`.

## Subsequent deploys

Same `build` → `run --rm migrate` → `up -d` sequence. `migrate` is safe to
re-run (Drizzle migrations are idempotent; `seedAdminUser()` no-ops once the
admin user already exists).
