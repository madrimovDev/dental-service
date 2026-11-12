# Umumiy VPS deploy (host Caddy)

Supervisor, Lab Hub va bulut (SaaS) bitta VPS'da (`13.140.211.189`, Ubuntu 24.04). Serverda **boshqa
loyihalar ham bor** (Woodo, neowise, updates), shuning uchun:

- 80/443 — serverning **o'z** Caddy'si (`systemctl caddy`, `/etc/caddy/sites/*.caddy`). Stack'lardagi
  ichki `caddy` servislari `profiles: [bundled-edge]` bilan **o'chirilgan**, ular hech qachon ishga tushirilmaydi.
- Ilova portlari faqat `127.0.0.1` da (Docker ufw'ni chetlab o'tadi — `0.0.0.0` taqiqlangan).
- Global `docker system prune` va boshqa compose loyihalariga tegadigan buyruqlar **YO'Q**.

## Domenlar va portlar

| Sayt fayli (`/etc/caddy/sites/`) | Domen | Loopback |
|---|---|---|
| `dental-cloud.caddy` | `dental.madrimov.uz` | web `4100`, api `4101` (`/api/*`, `/uploads/*`) |
| `dental-supervisor.caddy` | `sv.dental.madrimov.uz` | api `4110` (`/v1/*`), admin `4111` |
| `dental-lab.caddy` | `lab.dental.madrimov.uz` | api `4120` (`/v1/*`, `/health`), web `4121` |

DNS: `dental` va `*.dental` A yozuvlari → `13.140.211.189`. Sayt fayllari faqat DNS ishlagandan keyin
qo'yiladi (aks holda Let's Encrypt urinishlari rate-limit'ga tushadi):

```sh
sudo cp infra/vps/caddy/dental-*.caddy /etc/caddy/sites/
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy   # restart EMAS
```

`/internal/*` uchala saytda ham 404 — Supervisor↔Hub↔bulut faqat `dental_shared` docker tarmog'ida.
Ikki stack'da `api` nomli servis bor, shuning uchun stack'lararo faqat aliaslar ishlatiladi:
`supervisor-api:3101`, `lab-hub-api:8171`.

⚠️ **Supervisor domeni «yopishqoq»:** u va `packages/core/src/supervisor-public-key.ts` desktop
installer'ga quriladi. O'zgarsa — desktop qayta quriladi va tarqatiladi.

## Sirlar

`/srv/dental/secrets/` (700, fayllar 600, repo tashqarisida). Bir marta yaratiladi, qayta yozilmaydi:

```sh
cd /srv/dental/src && ./infra/vps/gen-secrets.sh
```

- `supervisor.env`, `lab-hub.env`, `cloud.env` — compose `--env-file`.
- `supervisor-private.pem` — litsenziya imzosi (FU-54 bo'yicha 2026-11-12 da yangi juftlik). Ochiq yarmi
  `supervisor-public.pem` → `packages/core/src/supervisor-public-key.ts`.
- `supervisor-admin.txt` — Supervisor admin login/parol (birinchi kirishdan keyin almashtiring).
- Uch umumiy token (ikki tomonda bir xil): `SUPERVISOR_HUB_TOKEN`, `SUPERVISOR_SAAS_TOKEN`,
  `SAAS_HUB_TOKEN = LAB_HUB_SERVICE_TOKEN`.

**Offline nusxa majburiy:** `supervisor-private.pem` va `lab-hub.env` dagi `LAB_HUB_KEK` — parol menejeri
yoki seyf. KEK yo'qolsa lab ma'lumotlari qaytarib bo'lmas yo'qoladi; RSA kalit yo'qolsa barcha litsenziyalar
qayta chiqariladi.

## Deploy

Kod `git archive` orqali yuboriladi (ishchi daraxt emas — lokal `.env`'lar tushmasligi uchun):

```sh
git archive --format=tar HEAD | ssh madrimov@13.140.211.189 'rm -rf /srv/dental/src.new && mkdir /srv/dental/src.new && tar -x -C /srv/dental/src.new && rm -rf /srv/dental/src && mv /srv/dental/src.new /srv/dental/src'
ssh madrimov@13.140.211.189 'cd /srv/dental/src && ./infra/vps/deploy.sh all'   # yoki supervisor|lab-hub|cloud
```

Compose loyiha nomlari: `dental-supervisor`, `dental-lab-hub`, `dental-cloud`.

## Zaxira

Har stack o'z skripti bilan (`infra/backup.sh`, `infra/supervisor/backup.sh`, `infra/lab-hub/backup.sh`),
cron orqali kuniga bir marta; `ENV_FILE`/loyiha nomlari shu sxemaga mos beriladi.
