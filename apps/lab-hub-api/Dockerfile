# syntax=docker/dockerfile:1
#
# Production image for @lab-hub/api (Bun + Hono) — Lab Hub markaziy xizmati
# (infra/lab-hub/). @dental/* bog'liqligi yo'q; supervisor-api Dockerfile naqshi.
#
# BUILD CONTEXT: repo ROOT —
#   docker build -f apps/lab-hub-api/Dockerfile -t lab-hub-api .

FROM oven/bun:1.2.21-alpine AS deps
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

FROM oven/bun:1.2.21-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY apps/lab-hub-api ./apps/lab-hub-api
WORKDIR /app/apps/lab-hub-api
# Shifrlangan fayllar uchun volume nuqtasi (bun foydalanuvchisiga tegishli).
RUN mkdir -p /data/uploads && chown -R bun:bun /data
USER bun
EXPOSE 8171
# Barcha konfiguratsiya process env'dan (--env-file YO'Q). `migrate` servisi
# CMD'ni `bun run src/db/migrate.ts` bilan almashtiradi.
CMD ["bun", "run", "src/index.ts"]
