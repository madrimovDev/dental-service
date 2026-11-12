# syntax=docker/dockerfile:1
#
# Production image for @lab-hub/web (Vite + React SPA) — laboratoriya portali,
# statik fayllar Caddy orqali (infra/lab-hub/). API'ga NISBIY `/v1/*` yo'li bilan
# gaplashadi (VITE_API_BASE_URL bo'sh) — public Caddy bitta host'dan ikkala
# servisni ham beradi, CORS/build-vaqti URL kerak emas.
#
# BUILD CONTEXT: repo ROOT (Bun workspaces root lockfile talab qiladi;
# Vite `@dental/*` ni src/ ga alias qiladi):
#
#   docker build -f apps/lab-hub-web/Dockerfile -t lab-hub-web .

# ---- build ------------------------------------------------------------------
FROM oven/bun:1.2.21-alpine AS build
WORKDIR /app

# `--frozen-lockfile` bun.lock'dagi BARCHA workspace manifestlarini talab qiladi.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/desktop/package.json apps/desktop/
COPY apps/lab-hub-api/package.json apps/lab-hub-api/
COPY apps/lab-hub-web/package.json apps/lab-hub-web/
COPY apps/landing/package.json apps/landing/
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
RUN bun install --frozen-lockfile

COPY apps/lab-hub-web ./apps/lab-hub-web
COPY packages/core ./packages/core
COPY packages/ui ./packages/ui
COPY packages/i18n ./packages/i18n
# Root tsconfig — apps/lab-hub-web/tsconfig.json extends ../../tsconfig.json.
COPY tsconfig.json ./

# Faqat bundle (typecheck — CI gate, release image qadami emas).
RUN cd apps/lab-hub-web && bunx vite build

# ---- runtime: Caddy statik SPA ----------------------------------------------
FROM caddy:2-alpine AS runtime
# History-mode SPA fallback + hashed assets cache (ichki :80, TLS tashqi Caddy'da).
COPY infra/Caddyfile.web /etc/caddy/Caddyfile
COPY --from=build /app/apps/lab-hub-web/dist /srv
EXPOSE 80
