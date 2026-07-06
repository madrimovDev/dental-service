# syntax=docker/dockerfile:1
#
# Production image for @dental/web (Vite + React SPA) served as static files
# by Caddy.
#
# BUILD CONTEXT: the repository ROOT (NOT apps/web). Bun workspaces require the
# root lockfile + workspace packages at build time, and Vite resolves
# `@dental/*` to their `src/` via aliases:
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg VITE_API_BASE_URL=https://api.example.com -t dental-web .
#
# VITE_API_BASE_URL is a BUILD-TIME constant — Vite inlines `import.meta.env.*`
# into the bundle, so it CANNOT be changed at runtime. Pass it per-environment.
# In dev the SPA uses a Vite proxy and leaves this empty; in prod the SPA calls
# the API origin directly (e.g. https://<host>/api via the same Caddy host, in
# which case an empty base + relative `/api` also works — see Caddyfile).

# ---- build: install deps + vite build ---------------------------------------
FROM oven/bun:1.2.21-alpine AS build
WORKDIR /app

# Manifests first (cache the install layer).
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
RUN bun install --frozen-lockfile

# Source needed for the web bundle (Vite aliases @dental/* → these src trees).
COPY apps/web ./apps/web
COPY packages/core ./packages/core
COPY packages/ui ./packages/ui
COPY packages/i18n ./packages/i18n
COPY packages/api-client ./packages/api-client
# Root tsconfig — apps/web/tsconfig.json extends ../../tsconfig.json.
COPY tsconfig.json ./

# Inlined into the bundle at build time.
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Production build = bundle only. Typechecking (`tsc --noEmit`) is a CI gate
# (.github/workflows/ci.yml), NOT a release-image step — a green CI is the
# precondition for building this image, so we run vite directly and keep the
# image fast + decoupled from the typecheck gate.
RUN cd apps/web && bunx vite build

# ---- runtime: Caddy serving the static SPA ----------------------------------
FROM caddy:2-alpine AS runtime

# SPA fallback config (history-mode routing → index.html).
COPY infra/Caddyfile.web /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

EXPOSE 80
# Caddy entrypoint is inherited from the base image.
