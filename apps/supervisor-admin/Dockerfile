# syntax=docker/dockerfile:1
#
# Production image for @supervisor/admin (Vite + React SPA) served as static
# files by Caddy — the Supervisor vendor's own admin panel, NOT part of the
# per-clinic dental-service deploy.
#
# BUILD CONTEXT: the repository ROOT (NOT apps/supervisor-admin) — Bun
# workspaces require the root lockfile at install time:
#
#   docker build -f apps/supervisor-admin/Dockerfile -t supervisor-admin .
#
# The admin panel talks to the API via a RELATIVE path (VITE_API_URL unset,
# see src/lib/api.ts) — infra/supervisor/Caddyfile proxies both services from
# the same public host, so no build-time API URL / CORS config is needed.

# ---- build: install deps + vite build ---------------------------------------
FROM oven/bun:1.2.21-alpine AS build
WORKDIR /app

# `bun install --frozen-lockfile` validates against EVERY workspace declared
# in bun.lock, not just this app's dependencies — see the equivalent note in
# apps/supervisor-api/Dockerfile.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/desktop/package.json apps/desktop/
COPY apps/supervisor-admin/package.json apps/supervisor-admin/
COPY apps/supervisor-api/package.json apps/supervisor-api/
COPY apps/telegram-bot/package.json apps/telegram-bot/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/core/package.json packages/core/
COPY packages/db-schema/package.json packages/db-schema/
COPY packages/fiscal/package.json packages/fiscal/
COPY packages/i18n/package.json packages/i18n/
COPY packages/notifications/package.json packages/notifications/
COPY packages/ui/package.json packages/ui/
RUN bun install --frozen-lockfile

COPY apps/supervisor-admin ./apps/supervisor-admin
# Root tsconfig — apps/supervisor-admin/tsconfig.json extends ../../tsconfig.json.
COPY tsconfig.json ./

RUN cd apps/supervisor-admin && bunx vite build

# ---- runtime: Caddy serving the static SPA ----------------------------------
FROM caddy:2-alpine AS runtime

# SPA fallback (history-mode client-side routing → index.html for unknown paths).
RUN printf '%s\n' \
  ':80 {' \
  '	root * /usr/share/caddy' \
  '	file_server' \
  '	try_files {path} /index.html' \
  '}' \
  > /etc/caddy/Caddyfile

COPY --from=build /app/apps/supervisor-admin/dist /usr/share/caddy

EXPOSE 80
# Caddy entrypoint is inherited from the base image.
