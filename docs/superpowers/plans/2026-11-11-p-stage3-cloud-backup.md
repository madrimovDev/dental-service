# P bosqichi 3 — Bulut uploads + zaxira (P17, P16 zaxira qismi) Implementation Plan

> **For agentic workers:** superpowers:executing-plans. Ijro qoidalari: `docs/ORCHESTRATION-GUIDE.md`. Steps `- [ ]`.

**Goal:** Bulut (SaaS) deploy'ida yuklangan fayllar volume'da saqlanadi va zaxiraga kiradi; MinIO butunlay olib tashlanadi; Supervisor bazasi va RSA private key uchun zaxira tartibi bor.

**Architecture:** Ikki lane, fayllari kesishmaydi. L1 — `infra/docker-compose.prod.yml`, `infra/docker-compose.yml`, `infra/backup.sh`, `apps/api` env sxemasi, `.env*.example`, CI env, `docs/runbooks/{backup-restore,deployment}.md`. L2 — `infra/supervisor/` (yangi `backup.sh`, README bo'limi).

**Tech Stack:** Docker Compose, POSIX sh, Bun (env sxemasi testi).

**Spec:** `docs/superpowers/specs/2026-11-11-completion-roadmap-design.md` §3.4.

## Global Constraints

- Real klinika yo'q — mavjud MinIO ma'lumotini ko'chirish **shart emas**.
- API konteyneri `USER bun` bilan ishlaydi — uploads volume yozish huquqi `bun` foydalanuvchisida bo'lishi kerak (Dockerfile'da `mkdir -p /data/uploads && chown bun:bun /data/uploads`, volume shu yo'lga).
- `UPLOADS_DIR=/data/uploads` API'ga (worker fayllarga tegmasa — unga kerak emas; `grep storage` bilan tekshiring).
- Skriptlar POSIX `sh`, `set -eu`, xatoda non-zero exit. Tibbiy ma'lumot — zaxira faylari `chmod 600`/papka `700`.
- VPS/domen/TLS **qilinmaydi** (bosqich 12).

## Review Focus

1. **Konteyner qayta yaratilganda fayllar saqlanadi** — `docker compose down && up` dan keyin `/data/uploads` dagi fayl joyida (L1 smoke qadam).
2. **`MINIO_*` env yo'q bo'lsa API va worker ishga tushadi** — env sxemasi testi.
3. **`backup.sh` uploads'ni volume'dan oladi** (MinIO emas) va restore runbook'i shu formatga mos.
4. **Supervisor zaxirasi parolni log'ga chiqarmaydi** (`set -x` yo'q, URL `ps`da ko'rinmaydi — `PGPASSWORD` env orqali yoki `docker compose exec`).
5. **Retention** — eski zaxiralar o'chiriladi, oxirgisi hech qachon o'chirilmaydi.

---

### Task L1.1: P17 — uploads volume, MinIO olib tashlash, backup.sh

**Tier:** T2 `sonnet`·`medium`.

**Files:** Modify `infra/docker-compose.prod.yml` (minio, minio-init, `minio_data` olib tashlanadi; `api`ga `UPLOADS_DIR: /data/uploads` + `volumes: [uploads_data:/data/uploads]`; `backup` xizmati bo'lsa unga `uploads_data:/data/uploads:ro`), `infra/docker-compose.yml` (dev: minio olib tashlanadi), `apps/api/Dockerfile` (uploads papkasi + chown), `infra/backup.sh` (2-qadam: `tar -C "${UPLOADS_DIR:-/data/uploads}" -czf "${DEST}/uploads.tar.gz" .`; manifest `uploads=uploads.tar.gz`; `mc` talabi olib tashlanadi; off-host: `BACKUP_RSYNC_TARGET` bo'lsa `rsync -a --delete`), `apps/api/src/lib/env-schema.ts:40-43` (`MINIO_*` o'chiriladi) + `env-schema.test.ts`, `apps/api/src/db/migrate.ts:12` izoh, `.env.example`, `.env.production.example`, `.github/workflows/ci.yml:41-44`, `docs/runbooks/backup-restore.md`, `docs/runbooks/deployment.md`.

- [ ] **Step 1:** `env-schema.test.ts`ga test: `MINIO_*`siz minimal env parse bo'ladi va natijada `MINIO_ENDPOINT` kaliti yo'q. FAIL ko'ring (`cd apps/api && bun test --env-file=../../.env src/lib/env-schema.test.ts`).
- [ ] **Step 2:** Yuqoridagi o'zgarishlar. `grep -rn MINIO --exclude-dir=node_modules --exclude-dir=.git . | grep -v '^./docs/'` → faqat tarixiy izohlar qolmasin (0 qator, `docs/` bundan mustasno; `docs/runbooks` yangilanadi).
- [ ] **Step 3:** `docker compose -f infra/docker-compose.prod.yml config -q` (dummy env bilan: `env $(sed -n 's/^\([A-Z_]*\)=.*/\1=x/p' .env.production.example | xargs) …`) → exit 0. `sh -n infra/backup.sh` → 0.
- [ ] **Step 4:** backup.sh smoke (lokal): vaqtinchalik `UPLOADS_DIR` (2 ta fayl) + `DATABASE_ADMIN_URL` lokal `dental` bazaga, `BACKUP_DIR` scratch → `db.dump`, `uploads.tar.gz`, `MANIFEST` paydo bo'ladi; `tar -tzf` fayllarni ko'rsatadi; `pg_restore --list db.dump` 0.
- [ ] **Step 5:** env-schema testi PASS + `bunx tsc --noEmit -p apps/api`. Commit `fix(infra): bulutda uploads volume, backup lokal fayllarga, MinIO olib tashlandi (P17)`.

### Task L2.1: P16 — Supervisor zaxira skripti + RSA kalit tartibi

**Tier:** T1 `haiku`·`medium`.

**Files:** Create `infra/supervisor/backup.sh`; Modify `infra/supervisor/README.md` (yangi bo'lim «Zaxira va RSA kalit»).

- [ ] **Step 1:** `infra/supervisor/backup.sh`: env `COMPOSE_FILE` (default `docker-compose.ip.yml`, skript papkasiga nisbatan), `BACKUP_DIR` (default `/var/backups/supervisor`), `RETENTION_DAYS` (30), ixtiyoriy `BACKUP_RSYNC_TARGET`. `docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U "${POSTGRES_USER:-supervisor}" -Fc supervisor > "$DEST/supervisor.dump"` (parol konteyner ichida — host'da URL yo'q); `.env.production` (RSA_PRIVATE_KEY bor) **nusxalanmaydi** — README'da alohida offline tartib. Retention: `find … -mtime +N` lekin eng yangisi saqlanadi. `umask 077`.
- [ ] **Step 2:** `sh -n infra/supervisor/backup.sh` → 0; lokal smoke: `COMPOSE_FILE` o'rniga test uchun `PG_DUMP_CMD` override (masalan `docker exec dental-postgres pg_dump -U dental -Fc supervisor`) → `supervisor.dump` paydo, `pg_restore --list` 0.
- [ ] **Step 3:** README: cron misoli (`15 3 * * * /home/<user>/dental-service/infra/supervisor/backup.sh >> /var/log/supervisor-backup.log 2>&1`), tiklash buyrug'i (`pg_restore --clean --if-exists -d supervisor`), **RSA private key**: bitta nusxa parol bilan shifrlangan (`gpg -c`) USB/offline saqlanadi, VM'dagi `.env.production` yagona onlayn nusxa; kalit yo'qolsa barcha `.lic` imzolari tekshirilmay qoladi → yangi keypair + `packages/core/src/supervisor-public-key.ts` + barcha klinikaga yangi build (Qaror #42).
- [ ] **Step 4:** Commit `feat(supervisor): zaxira skripti va RSA kalit saqlash tartibi (P16)`.

---

## Ijro
- L1 va L2 parallel, DB/Redis lane'i shart emas (smoke lokal `dental`/`supervisor` bazalaridan **faqat o'qiydi**).
- Verifier yo'q (pul/RLS/litsenziya emas); reviewer har lane'da.
