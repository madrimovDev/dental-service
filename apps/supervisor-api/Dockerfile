# syntax=docker/dockerfile:1
#
# Production image for @supervisor/api (Bun + Hono).
#
# This is the Supervisor vendor's OWN centrally-hosted licensing/admin backend
# — NOT part of the per-clinic dental-service deploy (see apps/api/Dockerfile
# for that). @supervisor/api has no @dental/* workspace package dependencies,
# so this image is a leaner variant of apps/api/Dockerfile: no packages/* to
# copy, just the root lockfile + this one app.
#
# BUILD CONTEXT: the repository ROOT (NOT apps/supervisor-api). Bun workspaces
# require the root lockfile (bun.lock) present at install time:
#
#   docker build -f apps/supervisor-api/Dockerfile -t supervisor-api .

# ---- deps: resolve workspace dependencies from the root lockfile -------------
FROM oven/bun:1.2.21-alpine AS deps
WORKDIR /app

# Manifests only first for layer caching — source changes don't invalidate
# the (slow) `bun install` layer.
#
# `bun install --frozen-lockfile` validates against EVERY workspace declared
# in bun.lock, not just this app's dependencies — omitting any workspace
# manifest (even an unrelated one) makes bun see the lockfile as "changed" and
# fail. So despite @supervisor/api having no @dental/* deps, every workspace
# package.json in the monorepo must be present here.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/desktop/package.json apps/desktop/
COPY apps/supervisor-admin/package.json apps/supervisor-admin/
COPY apps/supervisor-api/package.json apps/supervisor-api/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/core/package.json packages/core/
COPY packages/db-schema/package.json packages/db-schema/
COPY packages/fiscal/package.json packages/fiscal/
COPY packages/i18n/package.json packages/i18n/
COPY packages/notifications/package.json packages/notifications/
COPY packages/ui/package.json packages/ui/

# Frozen install — fails if bun.lock is out of date (matches CI guarantee).
RUN bun install --frozen-lockfile

# ---- runtime: slim image carrying source + resolved node_modules -------------
FROM oven/bun:1.2.21-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY apps/supervisor-api ./apps/supervisor-api

WORKDIR /app/apps/supervisor-api

# The bun base image ships a non-root `bun` user — run as it.
USER bun

EXPOSE 3101

# Reads ALL config from process env (NO --env-file). Secrets are injected by
# the orchestrator — see infra/supervisor/.env.production.example. The
# `migrate` service in infra/supervisor/docker-compose.prod.yml overrides CMD
# to `bun run src/db/migrate.ts`.
CMD ["bun", "run", "src/index.ts"]
