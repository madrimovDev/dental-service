# M0 — Local Development Setup

Bu hujjat dental-service'ni mahalliy ravishda ishga tushirish bo'yicha qadam-baqadam qo'llanma.

## Talab qilinadi

- **Bun** ≥ 1.2.21 — https://bun.sh
- **Docker** ≥ 28 (Docker Compose v2 bilan)
- **Git** ≥ 2.x

Tekshirish:
```bash
bun --version && docker --version && git --version
```

### Docker permission masalasi (Linux)

Agar `docker ps` ishlatib quyidagi xato chiqsa:
```
permission denied while trying to connect to the Docker daemon socket
```

Ikki variant:

**Variant A — Docker Desktop ishga tushiring:**
```bash
systemctl --user start docker-desktop
# Yoki GUI orqali: Docker Desktop ilovasini ochish
```

**Variant B — User'ni docker group'ga qo'shing (system docker):**
```bash
sudo usermod -aG docker $USER
newgrp docker
# Logout/login kerak bo'lishi mumkin
```

## 1. Repository klonlash va dependencies

```bash
git clone <repo-url> dental-service
cd dental-service
bun install
```

`bun install` ishlab bo'lgach:
- `core.hooksPath` avtomatik `.githooks` ga o'rnatiladi (pre-commit hook ishlay boshlaydi)
- `node_modules/` yaratiladi
- `bun.lock` text format'da

## 2. Environment fayli

```bash
cp .env.example .env
```

`.env` faylni o'qib chiqing. Production'da `JWT_SECRET`ni o'zgartirish shart.

## 3. Local infrastructure (Postgres, Redis, MinIO)

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d
```

Bu uchta xizmatni ishga tushiradi:
| Xizmat | Port | Maqsad |
|---|---|---|
| Postgres 16 | 5432 | Asosiy ma'lumotlar bazasi |
| Redis 7 | 6379 | Cache, BullMQ queue |
| MinIO | 9000 (API), 9001 (console) | Rasm/fayl saqlash (S3-compat) |

MinIO console: http://localhost:9001 (login: `dental` / `dental_local_dev`)

Tekshirish:
```bash
docker compose -f infra/docker-compose.yml ps
# Hammasi "healthy" bo'lishi kerak
```

Stop:
```bash
docker compose -f infra/docker-compose.yml down
# Yoki ma'lumotlarni ham tozalash uchun:
docker compose -f infra/docker-compose.yml down -v
```

## 4. Database migration (M0 da placeholder, M1 da to'liq)

```bash
bun db:generate    # Migrationni schema'dan generate qiladi
bun db:migrate     # Migrationni apply qiladi
```

## 5. Dev server

```bash
bun dev
# Parallel ishlaydi:
# - API:  http://localhost:8001
# - Web:  http://localhost:8000
```

Hot-reload ishlaydi — kodga o'zgartirish kiritilganda avtomatik qayta yuklanadi.

## 6. Tekshirishlar

```bash
bun run lint        # Biome lint check
bun run typecheck   # TypeScript turbo bilan
bun run test        # Vitest har paketda
bun run format      # Auto-format
```

## 7. Drizzle Studio (DB GUI)

```bash
bun db:studio
# Brauzer ochiladi, jadval/ma'lumotlarni interaktiv ko'rish/tahrirlash mumkin
```

## Tushuncha — port xaritasi

| Service | Local URL |
|---|---|
| Web (Vite) | http://localhost:8000 |
| API (Hono) | http://localhost:8001 |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |
| MinIO API | http://localhost:9000 |
| MinIO Console | http://localhost:9001 |

Vite konfiguratsiyada `/api` requestlar `localhost:8001`ga proxy qilinadi.

## Muammolarni hal qilish

### "fatal: not in a git directory"
`bun install` qachondir `prepare` script'ni ishga tushiradi va `git config core.hooksPath` chaqiradi. Agar git repo init qilinmagan bo'lsa, bu xato kelib chiqadi (lekin install davom etadi). Repo ichida git init qilingach yo'qoladi.

### Port bandga olinganda
`.env` faylda port'ni o'zgartiring (masalan `POSTGRES_PORT=5433`) va `docker compose down && up -d` qayta qiling.

### MinIO bucket yaratilmagan
`minio-init` konteyner avtomatik bucket yaratadi. Agar muvaffaqiyatsiz bo'lsa:
```bash
docker compose -f infra/docker-compose.yml logs minio-init
```
