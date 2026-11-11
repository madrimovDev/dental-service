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

## Zaxira va RSA kalit

### 1. Baza zaxirasi (cron)

`backup.sh` Supervisor bazasini (`pg_dump -Fc`) `BACKUP_DIR` (default
`/var/backups/supervisor`) ichiga yozadi. Parol host'da yo'q — dump konteyner
ichida (`docker compose exec postgres pg_dump`) ishlaydi. Skript `set -x`
ishlatmaydi, URL argumentda yo'q.

Cron (VM'da, root yoki zaxira foydalanuvchisi):

```cron
15 3 * * * /home/<user>/dental-service/infra/supervisor/backup.sh >> /var/log/supervisor-backup.log 2>&1
```

Env (ixtiyoriy, `export` yoki cron qatorida):

- `COMPOSE_FILE` — default `docker-compose.ip.yml` (skript papkasidan).
  Domen rejimida `docker-compose.prod.yml` ko'rsating.
- `ENV_FILE` — default `infra/supervisor/.env.production`. Compose interpolatsiyasi
  (`${POSTGRES_USER:?}`, `${RSA_PRIVATE_KEY:?}` …) uchun skript `docker compose --env-file`
  bilan shu faylni beradi. Cron'da majburiy: compose `.env.production`ni o'zi yuklamaydi.
- `POSTGRES_USER` — default `supervisor`; `.env.production`dagidan farq qilsa, shu yerda bering.
- `BACKUP_DIR` — default `/var/backups/supervisor` (papka `700`, fayllar `600`).
- `RETENTION_DAYS` — default `30`. Eng yangi zaxira hech qachon o'chirilmaydi.
- `BACKUP_RSYNC_TARGET` — masalan `user@backuphost:/srv/supervisor-backups/`.
  Berilsa, `BACKUP_DIR` shu manzilga nusxalanadi (off-host; DR uchun tavsiya etiladi).

Muvaffaqiyatsiz zaxira papkasi qoldirilmaydi, skript non-zero exit qaytaradi.

**Tiklash** (yangi yoki bo'sh bazaga; `<TS>` — zaxira papkasi nomi):

```bash
cd /home/<user>/dental-service/infra/supervisor
docker compose -f docker-compose.ip.yml --env-file .env.production exec -T postgres \
  pg_restore --clean --if-exists -U supervisor -d supervisor < /var/backups/supervisor/<TS>/supervisor.dump
```

Tiklashdan keyin `api`ni qayta ishga tushiring (`docker compose ... restart api`).
Avval `pg_restore --list /var/backups/supervisor/<TS>/supervisor.dump` bilan
faylni tekshirish mumkin.

### 2. RSA private key — ALOHIDA offline tartib

`RSA_PRIVATE_KEY` zaxira skripti tomonidan **nusxalanmaydi** (`.env.production`da
yashaydi). Kalit juftligi bitta: public half `packages/core/src/supervisor-public-key.ts`da,
private half faqat VM'dagi `.env.production`da.

- **Yagona onlayn nusxa:** VM'dagi `.env.production` (`RSA_PRIVATE_KEY`).
- **Offline zaxira:** private key'ning **bitta** nusxasi parol bilan shifrlanib
  (`gpg -c`) USB yoki boshqa offline joyda saqlanadi. Parol boshqa joyda
  (parol menejeri) saqlanadi — shifrlangan fayl va parol bir joyda bo'lmasin.

  ```bash
  # VM'da (kalit faqat stdin orqali, faylga yozilmaydi):
  umask 077
  printf '%s\n' "$(grep '^RSA_PRIVATE_KEY=' .env.production | cut -d= -f2-)" \
    | gpg -c --cipher-algo AES256 -o /tmp/rsa-private.key.gpg
  # /tmp/rsa-private.key.gpg ni USB ga ko'chiring, so'ng: shred -u /tmp/rsa-private.key.gpg
  ```

  (Agar `RSA_PRIVATE_KEY` qiymati ko'p qatorli PEM bo'lsa, `.env` formati
  `\n` escape'li bo'lishi mumkin — shifrlashdan oldin `.env.production`dagi
  aniq qiymatni tekshiring. Tiklash testini quruq joyda o'tkazing.)

- **Kalit yo'qolsa:** barcha mavjud `.lic` imzolari tekshirilmay qoladi. Tiklash
  yo'li: yangi RSA keypair generatsiya qilish → `packages/core/src/supervisor-public-key.ts`
  ni yangilash → barcha klinikalarga yangi build tarqatish (Qaror #42). Bu
  og'ir operatsiya — shuning uchun offline nusxa majburiy.
- Har yangi keypair'dan keyin offline nusxani yangilang va eskisini xavfsiz o'chiring.
