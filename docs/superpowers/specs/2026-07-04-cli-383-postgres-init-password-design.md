# CLI-383 — Production Postgres `dental_app` roli paroli hardcoded (Dizayn / Spec)

> **Sana:** 2026-07-04
> **Linear:** CLI-383 (High)
> **Scope:** `infra/postgres-init.sql` → `infra/postgres-init.sh`, `infra/docker-compose.prod.yml` (postgres/api/worker/migrate emas — faqat postgres service), `infra/docker-compose.yml` (dev, bir xil fayl bilan bog'liqligi sababli), `.env.production.example`, `.env.example`, `docs/runbooks/deployment.md`. Ilova manba kodi (`apps/api`) **o'zgarmaydi**.

---

## 1. Topilgan holat (kod o'qish natijasi)

**`infra/postgres-init.sql`** (30 qator, to'liq o'qildi) — `dental` (POSTGRES_USER, superuser) nomidan ishga tushadi va bitta maqsadga xizmat qiladi: **RLS-safe non-superuser app role** (`dental_app`) yaratish + unga kerakli grantlarni berish:
- 10-qator: `CREATE ROLE dental_app WITH LOGIN PASSWORD 'dental_app_local_dev';` — **muammoli qator**, parol literal string.
- 13-qator: `ALTER ROLE ... NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE` — xavfsizlik uchun muhim, o'zgarmaydi.
- 16-21-qator: `GRANT CONNECT`/`USAGE`/jadval+sequence grantlari — o'zgarmaydi.
- 25-29-qator: `ALTER DEFAULT PRIVILEGES FOR ROLE dental ...` — Drizzle migratsiyalar keyinchalik yaratadigan jadvallarga ham avtomatik grant berish uchun (kelajakdagi jadvallar `dental_app`ga ko'rinmay qolmasligi uchun kritik) — o'zgarmaydi.

**Xulosa: fayldagi CREATE ROLE'dan tashqari HAMMA qator saqlanishi shart** — bular bir martalik bootstrap emas, doimiy xavfsizlik invariant (RLS ishlashi shu grantlarga bog'liq).

**`infra/docker-compose.prod.yml`** (postgres service, 18-33 qator) — `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` operator tomonidan `${VAR:?...}` bilan majburiy beriladi (bu **superuser** `dental` rolini official Postgres image o'zi `initdb` paytida yaratadi — bu mexanizm allaqachon to'g'ri ishlaydi, muammo faqat ikkinchi, qo'lda yozilgan `dental_app` rolida). 27-qator: `./postgres-init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro` — **`.sql` kengaytma** bilan mount qilingan. Official Postgres image'ning `docker-entrypoint.sh` (`docker_process_init_files`) `.sql` fayllarni **o'zgarmasdan** `psql` orqali ishga tushiradi (env-interpolation YO'Q) — faqat `.sh` fayllarga (source yoki exec qilinadi, process env'ga to'liq kirish bilan) bu imkoniyat bor. Hozircha `/docker-entrypoint-initdb.d/`da **hech qanday `.sh` skript yo'q** — faqat bu bitta `.sql`.

**Muhim topilma — bu fayl `dev` bilan ham baham ko'riladi:** `infra/docker-compose.yml` (dev, 14-qator) **aynan bir xil** `./postgres-init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro` mount qatoriga ega (+ alohida `02-init-supervisor.sql`, bu ticket doirasidan tashqarida — prod compose'da mutlaqo mount qilinmaydi, alohida mahsulot). Demak `infra/postgres-init.sql` — bitta **jismoniy fayl**, ikkala compose (dev + prod) tomonidan ishlatiladi. Har qanday fix ikkalasiga ham ta'sir qiladi — buni e'tiborsiz qoldirib bo'lmaydi (§3 Global constraint).

**`.env.production.example`** (18-31 qator) — `DATABASE_URL` (25-qator, `dental_app` bilan, freeform connection-string) va `DATABASE_ADMIN_URL` (27-qator, `dental` bilan) ikkalasi ham **bitta butun URL string** sifatida operatorga beriladi — qismlardan (`user`/`password`/`host`/`db`) tuzilmaydi. `apps/api/src/lib/env-schema.ts:29-30` buni tasdiqlaydi: `DATABASE_URL: z.url()`, `DATABASE_ADMIN_URL: z.url().optional()` — ilova ularni **tayyor URL** sifatida o'qiydi, komponentlarga ajratmaydi. **Xulosa: ilova kodini o'zgartirmasdan bu ikki var formatini saqlash kerak** — yechim faqat infra qatlamida (compose + init skript) bo'lishi kerak.

**`.env.example`** (dev, 9-qator) — `DATABASE_URL=postgres://dental_app:dental_app_local_dev@localhost:5432/dental` — parol qismi **aynan** `postgres-init.sql`dagi hardcoded literalga mos keladi. **Bu — nega dev hozir "ishlaydi" (tasodifan): ikkala joyda ham bir xil qattiq yozilgan literal.** Prod'da esa `.env.production.example:25` operatorga **boshqa** (`__CHANGE_ME_app_db_password__`) qiymat qo'yishni aytadi — shu yerda haqiqiy divergensiya yuzaga keladi (ticketning tavsifi to'g'ri).

## 2. Yechim sinfi — nega `.sh` wrapper (ticket'ning A-variantini tanlash)

Ticket ikki variant taklif qiladi: (A) env-driven `.sh` entrypoint, yoki (B) faqat hujjatlashtirish ("DATABASE_URL aynan shu literal parolni ishlatishi kerak"). **A tanlandi** — sabab: (B) aynan hozirgi holatning o'zi (`.env.production.example` allaqachon operatorga "kuchli parol qo'y" deydi, lekin haqiqiy rol paroli reader e'tibor bermasa jim divergensiya qiladi — bu ticketni keltirib chiqargan aynan shu naqsh). Faqat hujjat qo'shish muammoni kamaytiradi, lekin yo'q qilmaydi — operator ikki joyni sinxron ushlab turishi doim ham amalga oshmaydi. (A) esa Postgres rolining haqiqiy parolini **ENV'ning o'zidan** o'qiydi — committed literal butunlay yo'qoladi, va agar operator `DATABASE_URL`dagi parolni `DENTAL_APP_DB_PASSWORD`dan farqli qilib qo'ysa, natija "committed parol xavfsizlik teshigi" emas, balki **darhol aniq auth failure** (fail-safe, fail-loud) — bu ticket DoD'ining "yoki app birinchi boot'da autentifikatsiya qila olmaydi" xavotirini string-security muammosidan operational-error muammosiga aylantiradi (yaxshiroq default).

## 3. Yondashuv

### 3.1 Yangi env var: `DENTAL_APP_DB_PASSWORD`

Faqat **postgres** service'ga kerak (init skript shuni o'qiydi) — `api`/`worker`/`migrate` servicelarga qo'shimcha threading **kerak emas**, chunki ular hali ham `DATABASE_URL`ning o'zini operatordan to'g'ridan-to'g'ri oladi (§4 — nega bu duplikatsiya qasddan qoldirilgan, kengaytirilmagan).

### 3.2 `infra/postgres-init.sql` → `infra/postgres-init.sh`

Bir xil grantlar, bitta farq bilan — parol endi shell env'dan o'qiladi:

```sh
#!/bin/sh
# Postgres init script (Docker image birinchi ishga tushishida ishlaydi).
# .sql'dan farqli o'laroq, docker-entrypoint.sh *.sh fayllarni process env bilan
# ishga tushiradi — shuning uchun parolni ENV orqali o'qiy olamiz (CLI-383).
#
# POSTGRES_USER (dental) sifatida ishga tushadi — u superuser.
# Bu yerda app-level non-superuser role yaratamiz.
#
# Production-grade pattern:
#   - 'dental' (superuser) — migrations va admin tasks uchun
#   - 'dental_app' (non-superuser, NO BYPASSRLS) — application connections uchun
# App 'dental_app' orqali ulanganda RLS to'liq qo'llaniladi.
set -eu

: "${DENTAL_APP_DB_PASSWORD:?DENTAL_APP_DB_PASSWORD muhit o'zgaruvchisi kerak (dental_app role paroli)}"

psql -v ON_ERROR_STOP=1 -v app_pw="$DENTAL_APP_DB_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL
CREATE ROLE dental_app WITH LOGIN PASSWORD :'app_pw';

-- Xavfsizlik: superuser ham, BYPASSRLS ham bo'lmasin
ALTER ROLE dental_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- DB ga ulanish va schema ishlatish
GRANT CONNECT ON DATABASE $POSTGRES_DB TO dental_app;
GRANT USAGE ON SCHEMA public TO dental_app;

-- Mavjud jadvallar va sequence'larga ruxsat (hozir bo'sh, kelajak uchun)
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON ALL TABLES IN SCHEMA public TO dental_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dental_app;

-- Drizzle migration'lar 'dental' (superuser) bilan ishlaganda yaratadigan
-- kelajakdagi jadvallar uchun ham avtomatik ruxsat:
ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLES TO dental_app;

ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dental_app;
EOSQL
```

Izoh: parol **raw splicing bilan EMAS**, `psql -v app_pw="$DENTAL_APP_DB_PASSWORD"` + SQL ichida `:'app_pw'` orqali beriladi — bu psql'ning o'z quoting mexanizmi, parol ichida bitta qo'shtirnoq (`'`) bo'lsa ham xavfsiz escape qiladi (agar parol to'g'ridan-to'g'ri `'$DENTAL_APP_DB_PASSWORD'` shaklida splice qilinsa, ichida `'` bo'lgan parol SQL syntax xatosini keltirib chiqaradi — parol menejerlari ko'pincha shunday belgilar generate qiladi, `.env.production.example` esa parolni faqat base64/alifbo-raqamli bo'lishini talab qilmaydi). `$POSTGRES_USER`/`$POSTGRES_DB` esa oddiy shell interpolation orqali qoladi (bular operator tomonidan boshqariladigan identifikatorlar, quoting xavfi yo'q — parol emas). Heredoc endi **oddiy** `<<EOSQL` (`-` belgisiz, terminator 0-ustunda) — `<<-` faqat **tab** bilan boshlangan qatorlarni kesib tashlaydi, **probel** bilan emas; agar implementator kodni probel-indentatsiya bilan ko'chirsa, `EOSQL` tanilmay qolib heredoc "runaway" bo'lib ketishi mumkin edi. SQL matnining o'zi bo'sh joyga sezgir emas, shuning uchun terminatorni 0-ustunga qo'yish xavfsizroq. `#!/bin/sh` — Postgres Alpine image'ning shell'i busybox `ash`; skript POSIX-sh (bashism yo'q).

**Executable bit:** fayl `chmod +x` qilinishi kerak (git bu bitni track qiladi, bind-mount host permission'ni saqlaydi). Sabab: `docker-entrypoint.sh` `.sh` fayllarni ikki xil rejimda ishga tushiradi — agar executable bo'lsa **subshell**da exec qiladi (izolyatsiyalangan), aks holda joriy shell'ga **source** qiladi (`. "$f"`). Bizning skript `set -eu` ishlatadi — agar source qilinsa, bu opsiyalar `docker-entrypoint.sh`ning o'zining shell holatiga sizib chiqishi mumkin (nozik, kutilmagan yon ta'sir). `chmod +x` bilan bundan qochiladi.

### 3.3 `infra/docker-compose.prod.yml` — postgres service

```yaml
    environment:
      POSTGRES_USER: ${POSTGRES_USER:?set POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB:?set POSTGRES_DB}
      DENTAL_APP_DB_PASSWORD: ${DENTAL_APP_DB_PASSWORD:?set DENTAL_APP_DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./postgres-init.sh:/docker-entrypoint-initdb.d/01-init.sh:ro
```

Fail-fast konvensiya (`${VAR:?...}`, defaultsiz) — faylning boshidagi izoh bilan bir xil ("NO `*_local_dev` fallback passwords... Inject via an env file or a secret manager").

### 3.4 `.env.production.example` — yangi var + mos bog'lanish izohi

```
# Non-superuser app role — created at first Postgres boot by
# infra/postgres-init.sh (CLI-383). MUST be the exact same password as the
# `dental_app:` segment of DATABASE_URL below — Postgres does not read
# DATABASE_URL, this var is what actually sets the role's password.
DENTAL_APP_DB_PASSWORD=__CHANGE_ME_app_db_password__
# Runtime (non-superuser, RLS applies). Host = `postgres` inside compose.
# Password segment here MUST equal DENTAL_APP_DB_PASSWORD above.
DATABASE_URL=postgres://dental_app:__CHANGE_ME_app_db_password__@postgres:5432/dental
```

Bir xil placeholder token (`__CHANGE_ME_app_db_password__`) ikkala qatorda takrorlanadi — operator uni bittadan almashtirsa (masalan find/replace bilan), ikkalasi ham avtomatik izchil bo'ladi.

### 3.5 `docs/runbooks/deployment.md` §2 — required secrets ro'yxati

46-qatorga `DENTAL_APP_DB_PASSWORD` qo'shiladi + parolning `DATABASE_URL` bilan mos kelishi shartligi eslatiladi (ticket DoD'ining "verified in production deploy checklist" qismi — bu loyihada bitta amaldagi "deploy checklist" hujjati shu fayl, alohida checklist fayli yo'q).

---

## 4. Global constraint

1. **Dev (`infra/docker-compose.yml`) HAM shu patternni qabul qilishi SHART — ixtiyoriy emas.** Sabab: §1'da topilganidek, `infra/postgres-init.sql` **bitta jismoniy fayl**, ikkala compose fayl tomonidan bir xil nisbiy yo'l bilan mount qilinadi (`./postgres-init.sql`). Agar faylni `.sh`ga aylantirib faqat prod compose'ni yangilasak, dev compose **buzilib qoladi** (endi mavjud bo'lmagan `.sql` faylni mount qilishga urinadi). Dev buzilmasligi uchun: `docker-compose.yml`dagi mount yo'li ham `./postgres-init.sh`ga o'zgaradi, va `environment` blokiga `DENTAL_APP_DB_PASSWORD: ${DENTAL_APP_DB_PASSWORD:-dental_app_local_dev}` qo'shiladi — **default bilan** (fail-fast emas), chunki dev faylning o'zi allaqachon boshqa har bir sirni shu konvensiya bilan beradi (`POSTGRES_PASSWORD:-dental_local_dev`, `REDIS_PASSWORD:-dental_local_dev`) — zero-config dev tajribasi saqlanadi, hech kim yangi `.env` yozishga majburlanmaydi. Default qiymat (`dental_app_local_dev`) — bugungi hardcoded literalning o'zi, shuning uchun mavjud `.env`siz dev muhitlar ham uzluksiz ishlashda davom etadi.
2. **`.env.example` (dev) ga `DENTAL_APP_DB_PASSWORD=dental_app_local_dev` qo'shish — ixtiyoriy, lekin tavsiya etiladi** (hujjatlashtirish uchun; compose default'i uni texnik jihatdan keraksiz qiladi, lekin fayl allaqachon `DATABASE_URL` ichida shu literalni ko'rsatib turibdi — yangi var qo'shish faylni o'z-o'ziga izchil qiladi, chalkashlikni kamaytiradi).
3. **`apps/api` ilova kodi (`env-schema.ts`, `client.ts`, `migrate.ts`) O'ZGARMAYDI.** `DATABASE_URL`/`DATABASE_ADMIN_URL` hamon operator tomonidan to'liq URL sifatida beriladi — Docker Compose darajasida bu ikkala var'ni `DENTAL_APP_DB_PASSWORD`/`POSTGRES_PASSWORD`dan **kompozitsiya qilish** (masalan `DATABASE_URL: postgres://dental_app:${DENTAL_APP_DB_PASSWORD}@postgres:5432/${POSTGRES_DB}`) **ko'rib chiqildi, lekin ushbu ticket doirasiga kiritilmadi** — bu duplikatsiyani strukturaviy ravishda yo'q qilardi (operator parolni ikki marta yozmasdan), lekin `api`/`worker`/`migrate` servicelariga qo'shimcha o'zgarish talab qiladi va ticketning aniq DoD'idan (faqat `postgres-init.sql` + hujjat) tashqariga chiqadi. **Tavsiya:** alohida keyingi ticket sifatida ko'rib chiqilsin (`DATABASE_URL`/`DATABASE_ADMIN_URL`ni compose darajasida qismlardan tuzish — duplikatsiya xavfini butunlay yo'q qiladi). Hozircha — yangi `DENTAL_APP_DB_PASSWORD` + `DATABASE_URL`dagi mos parol qo'lda sinxronlanadi, lekin bu endi **aniq hujjatlashtirilgan** va committed-literal xavfsizlik teshigi yo'q qilingan holda.
4. **`infra/postgres-init-supervisor.sql` (dev, 02-init) — bu ticket doirasidan tashqarida.** Faqat dev compose'da mount qilinadi (supervisor-api o'z alohida DB'siga tegishli), prod compose bu faylni umuman mount qilmaydi — CLI-383 uni tegmaydi.
5. **Eski `postgres-init.sql` grant qatorlarining (13, 16-21, 25-29) BARCHASI `.sh`ga so'zma-so'z ko'chadi** — faqat 10-qatordagi parol literali o'zgaradi. Bu qatorlarni tushirib qoldirish RLS'ni amalda ishlamay qoladigan qilib qo'yadi (`dental_app` schema/jadval/sequence'larga kira olmay qoladi) — regressiya, ticket doirasidan tashqari lekin halokatli bo'lardi.
6. **`ALTER DEFAULT PRIVILEGES FOR ROLE $POSTGRES_USER`** — original faylda bu `dental` deb hardcoded edi, `.sh`da `$POSTGRES_USER`ga umumlashtirildi. Bu **faqat** `POSTGRES_USER` va `DATABASE_ADMIN_URL` ichidagi rol bir xil bo'lsa to'g'ri ishlaydi (chunki migratsiyalar `DATABASE_ADMIN_URL` orqali, ya'ni shu rol nomidan ishlaydi va kelajakdagi jadvallarni shu rol yaratadi). Ikkala `.env*.example` faylida ikkalasi ham `dental` — hozircha rost, lekin bu **faraz** — agar kimdir kelajakda `POSTGRES_USER`ni `DATABASE_ADMIN_URL`dagi roldan farqli qilib sozlasa, default-privileges noto'g'ri (bo'sh) grantorga tegishli bo'lib qoladi va yangi jadvallar `dental_app`ga ko'rinmay qoladi (jim regressiya). Bu ticket doirasida o'zgartirilmaydi, faqat shu faraz aniq yozib qo'yiladi.

## 5. DoD (ticket'dan, aniqlashtirilgan)

- [ ] `infra/postgres-init.sql` o'chirildi, `infra/postgres-init.sh` (executable, `DENTAL_APP_DB_PASSWORD` env'dan o'qiydi) bilan almashtirildi — barcha mavjud GRANT/ALTER DEFAULT PRIVILEGES qatorlari saqlangan holda.
- [ ] `infra/docker-compose.prod.yml` postgres service: yangi `DENTAL_APP_DB_PASSWORD: ${DENTAL_APP_DB_PASSWORD:?set DENTAL_APP_DB_PASSWORD}` + mount yo'li `01-init.sh`ga yangilangan.
- [ ] `infra/docker-compose.yml` (dev) postgres service: bir xil mount-yo'li yangilanishi + `DENTAL_APP_DB_PASSWORD:-dental_app_local_dev` default (dev buzilmasligi uchun majburiy, §4.1).
- [ ] `.env.production.example`: yangi `DENTAL_APP_DB_PASSWORD` + `DATABASE_URL` bilan mos kelish talabi izohlangan.
- [ ] `docs/runbooks/deployment.md` §2 required-secrets ro'yxatiga `DENTAL_APP_DB_PASSWORD` qo'shilgan.
- [ ] Real `docker compose up` bilan boot-test qilingan: (a) yangi parol bilan `dental_app` ulanadi, (b) eski hardcoded literal (`dental_app_local_dev`) bilan prod stack'da endi ulanib bo'lmaydi (auth rad etiladi) — bu ikkalasi ham bir xil test skriptida ko'rsatilishi kerak (regressiya-himoya).
