# Lab Hub — deploy (infra/lab-hub)

Laboratoriya portali markaziy xizmati: `apps/lab-hub-api` + `apps/lab-hub-web` (lab xodimlari portali).
Spec: `docs/superpowers/specs/2026-11-12-lab-portal-design.md` (L1–L10).

## Tarkib

| Servis | Vazifa |
|---|---|
| `postgres` | `lab_hub` bazasi (faqat `hub_internal` tarmog'ida) |
| `migrate` | drizzle migratsiyalari + RLS + `lab_hub_app` (NOSUPERUSER NOBYPASSRLS) roli |
| `lab-hub-api` | Bun + Hono, port 8171; `uploads_data` volume — faqat shifrlangan bloblar |
| `lab-hub-web` | Statik SPA (Vite build, Caddy :80); API'ga nisbiy `/v1/*` orqali |
| `caddy` | TLS 1.2+/HSTS, `/v1/*` → API, `/internal/*` → **404** (tashqariga yopiq), qolgani → `lab-hub-web` |

## Shifrlash (L2)

- **Transport:** faqat HTTPS (Caddy, Let's Encrypt). Klinika serverlari Hub sertifikatini public CA bilan tekshiradi.
- **Saqlashda:** konvert. Har lab uchun DEK (AES-256-GCM), `labs.dek_wrapped` = KEK bilan o'ralgan (labId AAD).
  Shifrlanadi: bemor ismi, izoh, rang, xabarlar, fayl nomlari, **fayllar** (`/data/uploads/<labId>/<uuid>.bin`).
  Ochiq: holat, muddat, id'lar, narxlar.
- **Runtime rol:** API `lab_hub_app` bilan ulanadi — RLS (`app.current_lab_id` / `app.current_clinic_id`) har so'rovda.

## KEK (master kalit)

```sh
head -c32 /dev/urandom | base64   # → LAB_HUB_KEK
```

- Faqat `.env.production`da (repo va zaxiradan TASHQARIDA). `LAB_HUB_KEK` yo'q yoki 32 bayt emas — API **ishga tushmaydi**.
- Offline nusxa: parol menejeri yoki qog'oz/seyf. Zaxira va KEK **alohida joyda** — biri o'g'irlansa, ikkinchisisiz foydasiz.
- KEK yo'qolsa: barcha DEK'lar, demak barcha ism/xabar/fayllar qaytarib bo'lmas yo'qoladi (narx/akt qoladi).
- Almashtirish (rotation) hozircha yo'q: kelajakda har lab DEK'ini yangi KEK bilan qayta o'rash (`dek_wrapped` UPDATE) — ma'lumot qayta shifrlanmaydi.

## Tarmoq (Supervisor bilan)

Hub va Supervisor bitta VPS'da alohida compose stack. Ikkalasi Supervisor tarmog'ida uchrashadi:

1. Avval `infra/supervisor` ishga tushadi (tarmoq nomi odatda `supervisor_internal`; `docker network ls`).
2. `SUPERVISOR_NETWORK` shu nom; `lab-hub-api` shu tarmoqqa ham ulanadi.
3. Ikkala `.env.production`da **bir xil** `SUPERVISOR_HUB_TOKEN` (`openssl rand -base64 48`).
4. Supervisor tomonida `LAB_HUB_URL=http://lab-hub-api:8171`; Hub tomonida `SUPERVISOR_URL=http://api:3101`.

Ichki yo'llar: Supervisor → Hub `/internal/labs`, `/internal/clinics`; Hub → Supervisor `/internal/clinics/:id/verify`.
Ikkala Caddy ham `/internal/*`ni tashqariga ochmaydi.

## Ishga tushirish

```sh
cd infra/lab-hub
cp .env.production.example /secure/lab-hub.env   # to'ldiring
docker compose -f docker-compose.prod.yml --env-file /secure/lab-hub.env build
docker compose -f docker-compose.prod.yml --env-file /secure/lab-hub.env run --rm migrate
docker compose -f docker-compose.prod.yml --env-file /secure/lab-hub.env up -d
curl -s https://$DOMAIN/health
```

Lablar Supervisor admin → «Laboratoriyalar»da yaratiladi (L6); lab rahbarining vaqtinchalik paroli bir marta ko'rsatiladi.

## Zaxira

```sh
ENV_FILE=/secure/lab-hub.env ./backup.sh          # cron: kuniga bir marta
```

`lab_hub.dump` (pg_dump -Fc) + `uploads.tar.gz` — ikkalasi ham allaqachon shifrlangan ma'lumot; KEK qo'shilmaydi.
Tiklash: `pg_restore --clean --if-exists -d lab_hub lab_hub.dump`, `tar -C /data -xzf uploads.tar.gz`
(`lab-hub-api` konteyneri ichida, keyin `migrate`), so'ng xuddi o'sha `LAB_HUB_KEK` bilan ishga tushiriladi.

## Saqlash muddati (L9) va obuna (L10)

- API ichida kunlik worker: `delivered`dan 12 oy o'tgan ishlarda ism/izoh/rang/xabarlar `NULL`, fayllar diskdan o'chadi, narx/akt qoladi.
- Lab obunasi: `expires_at` + 7 kun imtiyoz, keyin portal va klinika so'rovlari shu labga `403 lab.subscription_expired`.
  Uzaytirish — Supervisor admin «Uzaytirish». Klinika obunasi Supervisor'dan tekshiriladi (connect'da, keyin davriy).

## Lokal (dev / lane test)

```sh
cd apps/lab-hub-api
cp .env.example .env      # LAB_HUB_KEK, DATABASE_* to'ldiring
bun run db:migrate
bun run test
```
