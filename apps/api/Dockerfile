# syntax=docker/dockerfile:1
#
# Production image for @dental/api (Bun + Hono).
#
# BUILD CONTEXT: the repository ROOT (NOT apps/api). Bun workspaces require the
# root lockfile (bun.lock) + every workspace package present at install time, so
# the api image must be built with the monorepo root as context:
#
#   docker build -f apps/api/Dockerfile -t dental-api .
#
# The api runs TypeScript directly under Bun (no transpile step) and the
# workspace packages export their `./src/*.ts` entrypoints, so there is no
# separate "compile" output — the build stage only resolves dependencies and the
# runtime stage carries the source + node_modules.
#
# This same image serves BOTH the API server (default CMD) and the BullMQ worker
# (override CMD to `bun run apps/api/src/worker.ts`) — see infra/docker-compose.prod.yml.

# ---- deps: resolve workspace dependencies from the root lockfile -------------
FROM oven/bun:1.2.21-alpine AS deps
WORKDIR /app

# Copy only manifests first for better layer caching. A change to source code
# then does not invalidate the (slow) `bun install` layer.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY apps/telegram-bot/package.json apps/telegram-bot/
COPY apps/supervisor-api/package.json apps/supervisor-api/
COPY apps/supervisor-admin/package.json apps/supervisor-admin/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY packages/i18n/package.json packages/i18n/
COPY packages/api-client/package.json packages/api-client/
COPY packages/db-schema/package.json packages/db-schema/
COPY packages/notifications/package.json packages/notifications/
COPY packages/fiscal/package.json packages/fiscal/

# Frozen install — fails if bun.lock is out of date (matches CI guarantee).
RUN bun install --frozen-lockfile

# ---- runtime: slim image carrying source + resolved node_modules -------------
FROM oven/bun:1.2.21-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# node_modules (incl. workspace symlinks) from the deps stage.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

# Application + workspace source. The api consumes packages via their TS source,
# so the full package tree must be present at runtime.
COPY apps/api ./apps/api
COPY packages/core ./packages/core
COPY packages/db-schema ./packages/db-schema
COPY packages/notifications ./packages/notifications
COPY packages/fiscal ./packages/fiscal

WORKDIR /app/apps/api

# The bun base image ships a non-root `bun` user — run as it.
USER bun

EXPOSE 8001

# Reads ALL config from process env (NO --env-file). Secrets are injected by the
# orchestrator / secret manager — see .env.production.example + docs/runbooks.
CMD ["bun", "run", "src/index.ts"]
