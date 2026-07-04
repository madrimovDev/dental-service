# CLI-390 — Local Desktop hardcoded DB parol + `migrate.ts` noto'g'ri env-var (Dizayn / Spec)

> **Sana:** 2026-07-05
> **Linear:** CLI-390 (High)
> **Scope:** `apps/desktop/src/first-run.ts` (+ `.test.ts`), `apps/desktop/src/process-manager.ts` (+ `.test.ts`), `apps/api/src/db/migrate.ts`. `infra/postgres-init.sh`/`docker-compose.yml`/`.env.example` — **o'zgarmaydi** (CLI-383 bilan allaqachon to'g'ri; §1 pastda nega).

---

## 1. Topilgan holat (kod o'qish natijasi)

**`apps/desktop/src/process-manager.ts` (191 qator, to'liq o'qildi), `spawnApi()`:**
- Qator 132: `DATABASE_URL: 'postgresql://dental_app:dental_app_local_dev@localhost:5433/dental'` — literal, committed parol.
- Qator 138: `DATABASE_ADMIN_URL: 'postgresql://dental:dental@localhost:5433/dental'` — ham literal, lekin **boshqa rol** (`dental`, superuser).
- `process-manager.test.ts:93` (`toMatchObject`) va `:105-106` bu literalni **qasddan** lock qilgan (kod izohi: "Regression guard 2026-07-02 xavfsizlik bugi" — runtime hech qachon superuser bilan ulanmasligini tekshiradi, parolning o'zi emas).

**`apps/desktop/src/first-run.ts` (125 qator, to'liq o'qildi) — allaqachon mavjud "generate+persist on first run" pattern:**
- `getOrCreateJwtSecret()` (qator 62-71): `jwt-secret.txt`ga `randomBytes(32).toString('hex')` yozadi, `existsSync` bo'lsa shunchaki o'qiydi (idempotent). `runFirstSetup()` step 4'da chaqiriladi.
- **Bu ANIQ shu pattern** ticket DoD'i so'rayotgan ("generates+persists one on first run, matching the DENTAL_APP_DB_PASSWORD pattern") — yangi `getOrCreateDbPassword()` shu funksiyaning qarindoshi bo'lishi kerak, `process-manager.ts`da emas, **`first-run.ts`da** (JWT bilan bir joyda, bir xil fayl-yozish konvensiyasi).
- `runMigrations(apiExePath)` (qator 103-124): `api.exe migrate`ni `DATABASE_URL`/`DATABASE_ADMIN_URL` ikkalasini ham `'postgresql://dental:dental@localhost:5433/dental'` (superuser) bilan chaqiradi — **`DENTAL_APP_DB_PASSWORD` env'ni umuman uzatmaydi**. Bu — nega hozir `migrate.ts:66`dagi noto'g'ri nom (`DATABASE_APP_PASSWORD`) "jim ishlagandek" ko'ringan: hatto to'g'ri nom (`DENTAL_APP_DB_PASSWORD`) bo'lganda ham, Local Desktop first-run yo'lida bu env umuman uzatilmagan, shuning uchun `ensureAppRole()` doim hardcoded fallback'ga tushadi.

**`apps/api/src/db/migrate.ts` (179 qator, to'liq o'qildi), `ensureAppRole()` (qator 65-104):**
- Qator 65-66:
  ```ts
  const APP_ROLE = 'dental_app';
  const APP_ROLE_PASSWORD = process.env.DATABASE_APP_PASSWORD ?? 'dental_app_local_dev';
  ```
  `DATABASE_APP_PASSWORD` — hech qayerda (`infra/docker-compose.yml`, `.env.example`, `infra/postgres-init.sh`, `apps/desktop`) **o'rnatilmagan** nom. Haqiqiy ishlatiladigan nom — `DENTAL_APP_DB_PASSWORD` (CLI-383, `infra/postgres-init.sh:15`: `: "${DENTAL_APP_DB_PASSWORD:?...}"`; `docker-compose.yml:10`; `.env.example:8`).
- Qator 68-70: `if (existing.length > 0) return;` — rol allaqachon mavjud bo'lsa **hech narsa qilmaydi** (parolni yangilamaydi). Bu — nega bu bug **cloud/dev'da zararsiz** bo'lib qolgan: u yerda `dental_app` roli `infra/postgres-init.sh` orqali Postgres konteyneri birinchi boot'ida allaqachon yaratiladi (CLI-383) — `ensureAppRole()` shunchaki early-return qiladi, `APP_ROLE_PASSWORD` o'qilmaydi ham. **Faqat Local Desktop**'da (`initdb -U dental` — `dental_app` roli initdb paytida yaratilmaydi) `ensureAppRole()` haqiqatan CREATE ROLE bajaradi va noto'g'ri env-nom amalda ishlaydi (doim hardcoded fallback).
- Qator 56-64 (izoh bloki ichida ikki joy): qator 56 `` `infra/postgres-init.sql` `` va qator 62 `` `postgres-init.sql`dagi `` — CLI-383 bu faylni `.sh`ga o'zgartirdi (`git rm postgres-init.sql`, `postgres-init.sh` yaratildi), lekin CLI-383 spec'ining o'zi (`docs/superpowers/specs/2026-07-04-cli-383-postgres-init-password-design.md` §4.3: "`apps/api` ilova kodi ... O'ZGARMAYDI") **qasddan** `apps/api`ga tegmagan — shuning uchun bu ikki eskirgan izoh CLI-383'dan keyin ham qolib ketgan, xato emas, bilib qoldirilgan follow-up.

**`infra/postgres-init.sh` (39 qator, to'liq o'qildi) — replikatsiya qilinadigan haqiqiy pattern:**
```sh
: "${DENTAL_APP_DB_PASSWORD:?DENTAL_APP_DB_PASSWORD muhit o'zgaruvchisi kerak (dental_app role paroli)}"
...
CREATE ROLE dental_app WITH LOGIN PASSWORD :'app_pw';
```
Env-var nomi: **`DENTAL_APP_DB_PASSWORD`** — `docker-compose.yml:10` (`${DENTAL_APP_DB_PASSWORD:-dental_app_local_dev}`) va `.env.example:8` bilan bir xil. Bu — ticket DoD/CLAUDE.md ishora qilgan "DENTAL_APP_DB_PASSWORD pattern".

## 2. Yechim sinfi — nega "generate+persist" (JWT_SECRET replika), nega faqat `dental_app`

Ticket ikki narsani so'raydi: (a) desktop tomonida parol hardcoded literal emas, balki env'dan/generatsiyadan olinsin; (b) `migrate.ts` to'g'ri env-nomni o'qisin. Ikkalasi ham **bir xil qiymatni** oqib o'tishi kerak — desktop `spawnApi()`ning `DATABASE_URL`si bilan `runMigrations()`ning `dental_app`ni yaratayotganda ishlatgan paroli **mos kelmasa**, birinchi boot'dayoq auth failure (runtime ishlamay qoladi).

**Tanlangan yondashuv: `getOrCreateJwtSecret()`ning aynan o'zi kabi `getOrCreateDbPassword()`** (`first-run.ts`, `db-password.txt`, `randomBytes(32).toString('hex')`, `existsSync` bo'lsa o'qish, mode `0o600`). Bitta manba funksiya — ham `runMigrations()` (env sifatida `api.exe migrate`ga uzatish uchun), ham `process-manager.ts`ning `spawnApi()` (runtime `DATABASE_URL` qurish uchun) shu funksiyani chaqiradi → bir xil fayldan o'qiydi → hech qachon mos kelmay qolmaydi (env-file qo'lda sinxronlash yo'q, CLI-383 spec §4.3'dagi "duplikatsiya" muammosi bu yerda strukturaviy ravishda yo'q qilinadi, chunki bitta process ichida ikkala chaqiruv ham bir xil faylni o'qiydi).

**Nega `randomBytes(32).toString('hex')` (JWT bilan bir xil, 24 emas):** (1) bikeshedding yo'q — mavjud precedentni aynan takrorlash; (2) hex alifbo (`0-9a-f`) — CLI-383 spec o'zi ogohlantirgan psql-quoting xavfini (parol ichida `'` bo'lsa `CREATE ROLE ... PASSWORD '...'` sintaksisi buziladi, `migrate.ts:75`dagi `.replace(/'/g, "''")` bu holatni escape qiladi, lekin hex charset bilan bu yo'l umuman kerak bo'lmaydi) tabiiy ravishda oldini oladi.

**Nega FAQAT `dental_app` (`DATABASE_URL`), nega `DATABASE_ADMIN_URL` (superuser `dental`, qator 138) O'ZGARMAYDI:** Ticket DoD aniq "DENTAL_APP_DB_PASSWORD pattern"ga ishora qiladi — bu pattern faqat `dental_app` roli uchun mavjud (CLI-383). `dental` (superuser) rolining o'zi `initdb -U dental` orqali **parolsiz** yaratiladi (`first-run.ts:85-90`, `--pwfile` yo'q) — ya'ni hozirgi `'postgresql://dental:dental@...'` literalidagi `dental` parol qismi allaqachon haqiqiy Postgres rol-paroliga mos kelmasligi mumkin bo'lgan, alohida va chuqurroq muammo (superuser autentifikatsiyasi qay tarzda ishlayotgani — trust/pg_hba konfiguratsiyasiga bog'liq, bu ticket doirasida tekshirilmadi). Bu — **qasddan out-of-scope**: ticket'ning tavsiflangan defekti faqat "hardcoded literal ekanligi"ni aytadi, DoD esa faqat `DENTAL_APP_DB_PASSWORD`ga ishora qiladi. Alohida follow-up ticket sifatida yozib qo'yish tavsiya etiladi.

## 3. Yondashuv — aniq mexanizm

### 3.1 `first-run.ts`: `getOrCreateDbPassword()`

```ts
export const getDbPasswordPath = (): string => join(getDataDir(), 'db-password.txt');

export const getOrCreateDbPassword = (): string => {
  const path = getDbPasswordPath();
  if (existsSync(path)) {
    return readFileSync(path, 'utf8').trim();
  }
  mkdirSync(getDataDir(), { recursive: true });
  // Upgrade-safety (CLI-390): agar bu funksiya BIRINCHI marta chaqirilganda
  // Postgres klasteri ALLAQACHON mavjud bo'lsa (`isFirstRun()` false — ya'ni
  // bu kod versiyasi o'rnatilishidan OLDIN first-run allaqachon o'tgan,
  // `dental_app` roli eski hardcoded parol bilan allaqachon yaratilgan
  // bo'lishi mumkin) — tasodifiy YANGI parol generatsiya qilib bo'lmaydi,
  // chunki u mavjud rolning haqiqiy paroli bilan mos kelmaydi (runtime auth
  // failure). Faqat haqiqiy fresh install (`isFirstRun()` true — Postgres
  // klasteri hali yo'q, `dental_app` hali yaratilmagan) da tasodifiy parol
  // xavfsiz. Bu tekshiruv FAQAT birinchi (fayl-yaratuvchi) chaqiruvda muhim —
  // keyingi barcha chaqiruvlar `existsSync` orqali persisted qiymatni o'qiydi.
  const password = isFirstRun()
    ? randomBytes(32).toString('hex')
    : 'dental_app_local_dev'; // eski hardcoded literal — mavjud o'rnatishlar bilan moslik
  writeFileSync(path, password, { mode: 0o600 });
  return password;
};
```

**Chaqiruv tartibi (load-bearing):**
1. `runFirstSetup()` ichida `getOrCreateDbPassword()` **initdb'dan OLDIN** chaqiriladi (yangi step, mavjud step 2 — initdb'dan avval joylashtiriladi). Sabab: `isFirstRun()` `PG_VERSION` fayli mavjudligini tekshiradi; initdb aynan shu faylni yaratadi. Agar `getOrCreateDbPassword()` initdb'dan KEYIN chaqirilsa, haqiqiy fresh install'da ham `isFirstRun()` allaqachon `false` qaytargan bo'lardi (chunki initdb PG_VERSION'ni allaqachon yaratgan) — bu YANGI o'rnatishlarni ham "eski o'rnatish" deb aniqlab, ularga ham hardcoded legacy parolni berardi (funktsional, lekin xavfsizlik maqsadini yo'qqa chiqaradi — ticketning butun maqsadi behuda ketardi).
2. `runFirstSetup()` bu bosqichda faylni allaqachon yaratgani sababli, keyingi ikki chaqiruvchi (`runMigrations()` va `spawnApi()`) — ular `main.ts`da har doim `runFirstSetup()`dan KEYIN ishga tushadi (qarang §3.4) — shunchaki mavjud faylni o'qiydi, `isFirstRun()` filialiga umuman kirmaydi.
3. **Mavjud (upgrade) o'rnatish uchun:** `main.ts:162`dagi `firstRun` flag `false` bo'lgani sababli `runFirstSetup()`/`runMigrations()` UMUMAN chaqirilmaydi (`main.ts`ning `else` branch'i to'g'ridan-to'g'ri `startServer()`ni chaqiradi). Demak `getOrCreateDbPassword()` bunday holatda birinchi marta faqat `spawnApi()` ichidan chaqiriladi — o'sha paytda `isFirstRun()` haqiqatda `false` (Postgres klasteri chindan ham eski) — to'g'ri filialga tushadi, legacy literalni persist qiladi va mavjud `dental_app` roli bilan mos keladi.

### 3.2 `first-run.ts`: `runFirstSetup()` — yangi step

```ts
export const runFirstSetup = (): void => {
  const dataDir = getDataDir();
  const pgData = getPgDataDir();
  const resourcesDir = getResourcesDir();
  const confNames = getConfFileNames();

  // 1. Ma'lumotlar papkalarini yaratish
  mkdirSync(join(dataDir, 'uploads'), { recursive: true });
  mkdirSync(join(dataDir, 'logs'), { recursive: true });
  mkdirSync(pgData, { recursive: true });

  // 2. DB parolini generatsiya qilish/aniqlash — initdb'DAN OLDIN (CLI-390:
  //    isFirstRun() PG_VERSION mavjudligiga tayanadi, initdb esa shu faylni
  //    yaratadi — tartib teskari bo'lsa fresh install ham "eski o'rnatish"
  //    deb noto'g'ri aniqlanadi).
  getOrCreateDbPassword();

  // 3. initdb — postgres data dir yaratish
  ...
  // 4. postgres.conf / valkey.conf nusxalash
  ...
  // 5. JWT_SECRET
  getOrCreateJwtSecret();
};
```

### 3.3 `first-run.ts`: `runMigrations()` — `DENTAL_APP_DB_PASSWORD` env qo'shiladi

```ts
const result = spawnSync(apiExePath, ['migrate'], {
  env: {
    ...process.env,
    DATABASE_URL: 'postgresql://dental:dental@localhost:5433/dental',
    DATABASE_ADMIN_URL: 'postgresql://dental:dental@localhost:5433/dental',
    DENTAL_APP_DB_PASSWORD: getOrCreateDbPassword(), // CLI-390 — dental_app roli shu parol bilan yaratiladi
    UPLOADS_DIR: join(dataDir, 'uploads'),
    MIGRATIONS_DIR: join(apiDir, 'drizzle'),
    RLS_MIGRATIONS_DIR: join(apiDir, 'migrations', 'rls'),
  },
  stdio: 'pipe',
});
```

### 3.4 `process-manager.ts`: `spawnApi()` — literal o'rniga `getOrCreateDbPassword()`

```ts
import { getOrCreateDbPassword, getOrCreateJwtSecret } from './first-run.js';
...
DATABASE_URL: `postgresql://dental_app:${getOrCreateDbPassword()}@localhost:5433/dental`,
...
DATABASE_ADMIN_URL: 'postgresql://dental:dental@localhost:5433/dental', // O'ZGARMAYDI — §2 rationale
```

### 3.5 `apps/api/src/db/migrate.ts` — env-var nomi + izohlar

Qator 66:
```ts
const APP_ROLE_PASSWORD = process.env.DENTAL_APP_DB_PASSWORD ?? 'dental_app_local_dev';
```
Qator 56 va 62 (izohlar): `` `infra/postgres-init.sql` `` → `` `infra/postgres-init.sh` ``, `` `postgres-init.sql`dagi `` → `` `postgres-init.sh`dagi ``.

## 4. Global constraint — mavjud o'rnatishlar buzilmasligi

**Talab:** ushbu o'zgarish allaqachon ishga tushirilgan (yoki jismoniy Windows PC'da o'rnatilgan) Local Desktop nusxalarini buzmasligi kerak — ularda Postgres klasteri va `dental_app` roli ESKI hardcoded parol (`dental_app_local_dev`) bilan allaqachon yaratilgan.

**Nega bu tabiiy ravishda xavfsiz (kod-oqim tahlili, §3.1 band 3):**
- `main.ts:162` `isFirstRun()`ni bitta marta o'qiydi va ikki mutlaqo alohida yo'lga ajratadi: `firstRun === true` bo'lsa — `runFirstSetup()` → `runMigrations()` → `startApiLayer()`; aks holda — to'g'ridan-to'g'ri `startServer()` (na `runFirstSetup()`, na `runMigrations()` chaqirilmaydi).
- Mavjud o'rnatish uchun `firstRun` doim `false` (`postgres/data/PG_VERSION` allaqachon mavjud) — demak `getOrCreateDbPassword()` birinchi marta FAQAT `spawnApi()` ichidan, `isFirstRun() === false` holatida chaqiriladi → §3.1'dagi funksiya legacy literalni persist qiladi → real Postgres'dagi `dental_app` roli bilan mos keladi → runtime uzilmaydi.
- `ensureAppRole()` (`migrate.ts:68-70`) `if (existing.length > 0) return;` — mavjud o'rnatishlarda `runMigrations()` umuman chaqirilmagani uchun bu funksiya ishlamaydi ham, lekin **hatto chaqirilganda ham** (masalan kelajakda boshqa bir yo'l orqali) rol mavjud bo'lsa parolni yangilamaydi — ya'ni bu funksiya hech qachon eski parolni buzib qo'ymaydi.

**Xulosa: alohida migratsiya/detection qadam KERAK EMAS.** `isFirstRun()`ning mavjud semantikasi (PG_VERSION borligi) va `main.ts`ning mavjud branching'i (fresh vs. non-fresh) o'zi kifoya — yangi kod faqat shu ikki filialga to'g'ri qiymat "ilib qo'yadi" (fresh → tasodifiy, mavjud → legacy), strukturani o'zgartirmaydi.

**Risk / edge-case (dokumentatsiya uchun, kod o'zgarishi talab qilmaydi):** agar kimdir `db-password.txt`siz, lekin Postgres klasteri MAVJUD bo'lgan holatda `DENTAL_DATA_DIR`ni qo'lda boshqa joyga ko'chirsa (yoki faylni o'chirib tashlasa) — keyingi ishga tushirishda `isFirstRun()` haligacha `false` qaytaradi (PG_VERSION o'sha joyda bor) → legacy literal qayta persist qilinadi → https muammo yo'q, chunki legacy literal — bu aynan eski kodning HAR DOIM ishlatgan qiymati.

## 5. DoD (ticket'dan, aniqlashtirilgan)

- [ ] `apps/desktop/src/first-run.ts`: `getOrCreateDbPassword()` qo'shildi (`db-password.txt`, `randomBytes(32).toString('hex')`, `0o600`, idempotent — `getOrCreateJwtSecret()` bilan bir xil shakl).
- [ ] `runFirstSetup()` `getOrCreateDbPassword()`ni initdb'dan OLDIN chaqiradi (tartib load-bearing, izohlangan).
- [ ] `runMigrations()` `DENTAL_APP_DB_PASSWORD: getOrCreateDbPassword()`ni `spawnSync` env'ga qo'shadi.
- [ ] `apps/desktop/src/process-manager.ts` `spawnApi()`: `DATABASE_URL` endi `getOrCreateDbPassword()`dan qurilgan (literal `dental_app_local_dev` qolmagan). `DATABASE_ADMIN_URL` qasddan o'zgarmagan (§2/§3.4 rationale).
- [ ] `apps/api/src/db/migrate.ts:66`: `process.env.DATABASE_APP_PASSWORD` → `process.env.DENTAL_APP_DB_PASSWORD`.
- [ ] `apps/api/src/db/migrate.ts:56,62`: eskirgan `postgres-init.sql` izohlari `postgres-init.sh`ga yangilangan.
- [ ] `first-run.test.ts`: yangi `describe('getOrCreateDbPassword')` bloki — fresh-install filiali (tasodifiy, `!= 'dental_app_local_dev'`, idempotent) + mavjud-o'rnatish-simulyatsiyasi filiali (PG_VERSION mavjud → legacy literal qaytaradi).
- [ ] `process-manager.test.ts`: qator 91-98'dagi `toMatchObject`dan `DATABASE_URL` exact-literal olib tashlangan; qator 105-106 saqlangan/kuchaytirilgan (`dental_app` bor, `://dental:` yo'q, legacy literalga teng EMAS, `getOrCreateDbPassword()` natijasiga teng).
- [ ] Barcha mavjud testlar (typecheck + `bun test`) yashil.

**E'tirof (test-coverage cheklovi, oshirib ko'rsatilmasin):** bu ticket'ning "upgrade-safety" mantig'i (`isFirstRun()`ga qarab tanlash) **mock qilingan `spawn` bilan real `initdb` ishga tushirmaydi** — ya'ni test muhitida `PG_VERSION` fayli hech qachon HAQIQIY yaratilmaydi, shuning uchun "fresh install → initdb'dan keyin ham hali random filial tanlanishi" xususiyatining o'zini unit test bilan to'g'ridan-to'g'ri isbotlab bo'lmaydi — bu chaqiruv-tartibiga (kod-review bilan tekshiriladigan, §3.1/§3.2'da izohlangan) va jismoniy Windows PC'da qo'lda tekshiruvga tayanadi (loyihada mavjud "Task 6-12 Electron/Windows-only ... jismoniy Windows PC'da qo'lda tekshiruv talab qilinadi" konvensiyasi bilan bir xil chegara).
