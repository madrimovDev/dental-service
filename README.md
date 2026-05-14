# Dental Service

> O'zbekistondagi stomatologiya klinikalari uchun SaaS boshqaruv tizimi.

Status: **Phase 1, M0 — Pre-flight setup**

## Stack

- **Backend:** Bun + Hono + Drizzle ORM + Zod + PostgreSQL 16 + Redis + BullMQ
- **Frontend:** Vite + React 18 + Mantine v7 + Zustand + TanStack Query
- **Desktop:** Electron (M6)
- **Monorepo:** Bun workspaces + Turborepo

## Hujjatlar

- [`CONCEPT.md`](./CONCEPT.md) — to'liq loyiha konsepti
- [`CLAUDE.md`](./CLAUDE.md) — texnik kontekst (Claude Code uchun)
- [`docs/M0-setup.md`](./docs/M0-setup.md) — local dev setup runbook

## Tezkor boshlash

```bash
# 1. Kerakli vositalar
# Bun >= 1.2.21, Docker, Git

# 2. O'rnatish
bun install

# 3. Local infra (Postgres, Redis, MinIO)
cp .env.example .env
docker compose -f infra/docker-compose.yml --env-file .env up -d

# 4. DB migration
bun db:migrate

# 5. Dev server
bun dev
# API: http://localhost:8001
# Web: http://localhost:8000
```

## Loyiha tarkibi

```
dental-service/
├── apps/
│   ├── api/        # Bun + Hono backend
│   ├── web/        # Vite + React + Mantine frontend
│   └── desktop/    # Electron shell (M6)
├── packages/
│   ├── core/           # Shared types, Zod schemas, permissions katalog
│   ├── db-schema/      # Drizzle schemalar
│   ├── i18n/           # uz/ru tarjima fayllari
│   ├── ui/             # Custom dental React komponentlar
│   ├── api-client/     # OpenAPI'dan auto-generated client
│   ├── odontogram/     # FDI tish kartasi (M4)
│   ├── fiscal/         # Soliq scaffold (M6)
│   └── notifications/  # SMS/Telegram channel abstractions
├── infra/         # Docker Compose, Caddyfile
└── docs/          # Texnik dokumentatsiya
```
