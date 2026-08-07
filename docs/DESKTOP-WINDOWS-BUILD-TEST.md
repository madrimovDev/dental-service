# Windows Desktop — Build & Test Runbook (CLI-361)

> Bu hujjat desktop (Electron) ilovani Windows'da build qilish va real Supervisor'ga qarshi
> test qilish uchun. Supervisor allaqachon deploy qilingan (2026-07-11) — quyidagi qiymatlar tayyor.
> Tegishli: `docs/superpowers/specs/2026-07-11-treatment-flow-audit-workflow-design.md` emas —
> desktop qismi: `infra/supervisor/`, `apps/desktop/`, `scripts/download-portable-bins.sh`.

---

## 0. Deploy holati — Supervisor QAYTA DEPLOY QILINDI (2026-08-07)

Supervisor **VM 103** (`server3`, `192.168.3.242`) da ishlayapti (IP/HTTP, domensiz test rejimi).
RSA keypair **o'zgarmadi** — VM'dagi `~/supervisor-private.pem` desktop build'ga baked qilingan
ochiq kalit (`packages/core/src/supervisor-public-key.ts`) bilan juft (SHA prefiks `9c147ae6…`).

2026-08-07 da baza **butunlay tozalandi** (`supervisor_postgres_data` volume o'chirildi) va
joriy `main` kodi bilan qayta qurildi — shu bilan aktivatsiya provisioning (2026-08-03) va
tiklanish (2026-08-06) epiklari birinchi marta VM'ga yetib bordi. **Eski `CB628-48559-B871D-69758`
kaliti endi mavjud emas.**

| Nima | Qiymat |
|---|---|
| `SUPERVISOR_URL` | `http://192.168.3.242` |
| `POSTGRES_WIN_URL` | `http://192.168.3.242/bins/postgres-16-win.zip` |
| `VALKEY_WIN_URL` | `http://192.168.3.242/bins/valkey-win.zip` |
| Test litsenziya kaliti | `4F25F-4085C-13F1F-2E3E5` (premium, 11 modul, 2027-12-31 gacha) |
| Klinika | «Test Klinika (Windows E2E)», filial «Bosh filial», `clinicId` `3bca0927-4668-4ba7-8334-9b082015802d` |
| Owner login telefoni | `+998901112233` (F.I.Sh. «Firdavs Madrimov») |
| Owner vaqtinchalik paroli | Supervisor admin panelidan olinadi (bu hujjatga commit qilinmaydi) — yo'qolsa `POST /v1/admin/clinics/<id>/prepare-reinstall` yangisini beradi |
| Admin panel | `http://192.168.3.242` (login: `admin@dental.local` / parol — VM'dagi `infra/supervisor/.env.production` ичидаги `ADMIN_SEED_PASSWORD`) |
| Yuklab olish sahifasi | `http://192.168.3.242/start` |

> ✅ **Aktivatsiya zanjiri Linux'da jonli tekshirildi (2026-08-07)** — shu VM'ga qarshi, toza
> bazada: `bootstrap-status {false,false}` → `POST /api/activate` → imzolangan provisioning
> bloki → tenant + owner + filial + **8 rol shabloni** yaratildi → owner telefoni va
> vaqtinchalik paroli bilan login **200** → `bootstrap-status {true,true}` → Supervisor'da
> vaqtinchalik parol o'chirildi, fingerprint bog'landi. So'ng `prepare-reinstall` bilan
> fingerprint tozalanib yangi vaqtinchalik parol berildi (Qaror #43 ham jonli tasdiqlandi).
> **Ya'ni Windows sessiyasi endi faqat Windows'ga xos yo'llarni sinaydi** (installer,
> first-run `initdb`, process-manager, fingerprint binding) — aktivatsiya mantig'ini emas.
>
> ⚠️ Windows'da aktivatsiya qilishdan oldin vaqtinchalik parolni admin paneldan oling.
> Agar `FINGERPRINT_MISMATCH` chiqsa (litsenziya boshqa mashinaga bog'langan) — admin
> paneldagi **prepare-reinstall** bitta amalda fingerprint'ni tozalaydi va yangi parol beradi.

> ⚠️ **Tarmoq:** bu IP **ichki LAN** (`192.168.3.x`). Windows mashina shu tarmoqda bo'lishi shart
> (masalan VM 102 `.245`, yoki LAN'dagi shaxsiy PC). Tashqarida bo'lsa — Supervisor'ni Traefik
> (LXC 200) orqali domenga chiqarish kerak (alohida qadam).
>
> ⚠️ **Valkey:** rasmiy Valkey Windows binariysi yo'q. `valkey-win.zip` ichidagi `valkey-server.exe`
> aslida **tporadowski Redis 5.0.14** (renamed) — BullMQ Streams'ni qo'llab-quvvatlaydi, `valkey-win.conf`
> bilan mos. **Test uchun ishlaydi**; production uchun to'g'ri Valkey Windows yechimi keyin ko'riladi.

---

## 0b. Build'ni LINUXDA qilish mumkin (2026-08-07 da amalda tekshirildi)

Windows installerni Windows mashinasida yig'ish **shart emas** — butun zanjir Linux'da
ishlaydi va `Dental Service Setup <ver>.exe` (NSIS, ~136 MB) chiqaradi:

```bash
export POSTGRES_WIN_URL="http://192.168.3.242/bins/postgres-16-win.zip"
export VALKEY_WIN_URL="http://192.168.3.242/bins/valkey-win.zip"
export UPDATE_URL="http://192.168.3.242/updates"   # electron-builder `publish:` uchun MAJBURIY

bash scripts/download-portable-bins.sh              # curl+unzip — platformadan mustaqil
(cd apps/api  && bun build --compile --target=bun-windows-x64 --outfile ../../dist/api.exe src/index.ts)
(cd apps/web  && bun run build)
(cd apps/desktop && bun run build:main && bunx electron-builder --config electron-builder.yml --win)
```

Nima uchun ishlaydi:
- **`api.exe`** — Bun cross-compile qiladi (`--target=bun-windows-x64` → haqiqiy PE32+ binariy).
  ⚠️ Bu bayroq **hayotiy muhim**: usiz `bun build --compile` HOST platformasiga quradi, ya'ni
  Linux'da ELF binariy yasab uni `api.exe` deb ataydi. Installer muammosiz yig'iladi va faqat
  mijoz mashinasida ishlamaydi. `package.json`dagi `build:api` endi bayroqni doim beradi
  (Windows'da build qilinsa ham natija bir xil).
- **Portable binariylar** — Supervisor VM'dan tayyor Windows zip sifatida yuklab olinadi,
  hech narsa kompilyatsiya qilinmaydi.
- **electron-builder** — NSIS/winCodeSign vositalarini o'zi yuklab oladi; imzo sertifikati
  bo'lmagani uchun signtool bosqichi jimgina o'tkazib yuboriladi (`signHook=false`).
  Wine talab qilinmadi.

**Faqat Windows'da bajarilishi mumkin bo'lgan qism — build EMAS, ishga tushirish:** o'rnatish,
first-run `initdb`, process-manager, fingerprint bog'lash. Ya'ni Linux'da yig'ib, chiqqan
`.exe` faylni Windows mashinasiga ko'chirib, faqat sinovni o'sha yerda o'tkazish mumkin.

### Relizni chiqarish

Build tugagach installerni Supervisor VM'ga chiqarish:

```bash
bash scripts/publish-desktop-build.sh
```

Skript PE32 ekanini tekshiradi (Linux'da `--target` tushib qolgan holatni
ushlaydi), `release.json` yozadi, VM'ga yuklaydi va `curl` bilan tasdiqlaydi.
So'ng sahifa: `http://192.168.3.242/start`.

⚠️ Agar kelajakda VM'dagi butun `~/dental-service` daraxtini `rsync --delete`
bilan qayta sinxronlaydigan buyruq qo'shilsa, unga ham `bins`dagi kabi
`--exclude 'infra/supervisor/releases'` qo'shilishi SHART — aks holda 135 MB
installer o'chib ketadi. Joriy holatda bu hujjatda daraxtni to'liq
sinxronlaydigan rsync buyrug'i yo'q (VM 2026-08-07 da qo'lda qayta qurilgan).

---

## 1. Windows prerequisites (agar build'ni Windows'da qilmoqchi bo'lsangiz)

- **Bun** (Windows) — `powershell -c "irm bun.sh/install.ps1 | iex"` yoki [bun.sh](https://bun.sh)
- **Git** + **Git Bash** (yoki WSL) — `prebuild` `.sh` skript ishlatadi (`scripts/download-portable-bins.sh`)
- **Node** (electron-builder ba'zan talab qiladi — odatda bun bilan ishlaydi)
- Windows mashina `192.168.3.242` ga yeta olishi (LAN) — tekshirish: brauzerda `http://192.168.3.242` ochilsa OK.

---

## 2. Build

**Git Bash** ichida (prebuild bash talab qiladi):

```bash
git clone <repo-url> && cd dental-service
git checkout main          # yangi public key + infra shu yerda
bun install

# Supervisor VM'dan binariylarni oladigan URL'lar:
export POSTGRES_WIN_URL="http://192.168.3.242/bins/postgres-16-win.zip"
export VALKEY_WIN_URL="http://192.168.3.242/bins/valkey-win.zip"

cd apps/desktop
bun run prebuild    # download-bins (PG16+Valkey) + api.exe (bun compile) + web build
bun run build       # build:main (tsc) + electron-builder → release\ ичида NSIS installer
```

**`prebuild` nima qiladi** (`apps/desktop/package.json`):
1. `scripts/download-portable-bins.sh` → `POSTGRES_WIN_URL`/`VALKEY_WIN_URL`'dan yuklab, `apps/desktop/resources/postgres/{bin,lib}` + `resources/valkey/valkey-server.exe` ga chiqaradi.
2. `build:api` → `cd apps/api && bun build --compile --outfile ../../dist/api.exe src/index.ts` (Windows'da `api.exe`).
3. `build:web` → `apps/web/dist`.

**Qo'lda alternativa** (agar `.sh`/prebuild muammo bersa):
```bash
# 1) binariylarni qo'lda joylashtirish:
#    resources/postgres/{bin,lib}   (postgres.exe + initdb.exe bilan)
#    resources/valkey/valkey-server.exe
# 2) api.exe:
cd apps/api && bun build --compile --outfile ../../dist/api.exe src/index.ts
# 3) web:
cd ../web && bun run build
# 4) installer:
cd ../desktop && bun run build
```

Natija: `apps/desktop/release/` ичida NSIS installer (`Dental Service Setup <ver>.exe`).

---

## 3. Postgres/Valkey — ilova O'ZI sozlaydimi? HA (birinchi ishga tushishda)

**Install paytida (installer):** Postgres/Valkey **sozlanmaydi**. Installer faqat fayllarni ko'chiradi +
**rol tanlash** dialogi (server/client) → `C:\ProgramData\DentalService\config.json`ga yozadi.
Binariylar installer ichida bundled.

**Ilova birinchi marta ishga tushganda (rol = server) — HAMMASI AVTOMATIK** (`apps/desktop/src/first-run.ts` + `process-manager.ts`):
- `initdb.exe` bilan Postgres data-katalogini yaratadi (`C:\ProgramData\DentalService\postgres\data`)
- `dental` bazasi + `dental_app` roli + parollar generatsiya
- **Barcha migratsiyalarni qo'llaydi** (jumladan `0041` lab-gate + `0042` odontogram)
- `postgres.exe` → **5433**, `valkey-server.exe` → **6380** child-process sifatida ishga tushadi
- `api.exe` ishga tushib ularga ulanadi

**Har keyingi startda:** process-manager Postgres+Valkey'ni avto qayta ishga tushiradi (Windows-service EMAS — ilova ochiq turганда yashaydi).

➡️ **Foydalanuvchi Postgres/Valkey'ni qo'lda o'rnatmaydi/sozlamaydi.** Ilova self-contained.

---

## 4. Install + Test

1. `release\Dental Service Setup <ver>.exe` ni ishga tushiring.
   - **Imzosiz** (code-signing yo'q, CLI-376) → SmartScreen "Windows protected your PC" → **«More info» → «Run anyway»**.
   - O'rnatishda **rol: `server`** tanlang.
2. Windows **tizim/user environment variable** o'rnating (ilovani ochishdan OLDIN):
   ```
   SUPERVISOR_URL = http://192.168.3.242
   ```
   (PowerShell admin: `[Environment]::SetEnvironmentVariable("SUPERVISOR_URL","http://192.168.3.242","Machine")` — keyin qayta login yoki ilovani yangi sessiyada oching.)
3. Ilovani oching → first-run Postgres(5433)+Valkey(6380) ko'taradi + migratsiya (~5-15s) → `/activate` sahifasi ochiladi.
4. Litsenziya kalitini kiriting: **`4F25F-4085C-13F1F-2E3E5`** → aktivatsiya → ilova yuklanadi.
5. Kuzating:
   - Machine-fingerprint binding (birinchi aktivatsiyada kalit shu mashinaga bog'lanadi)
   - Module-gating (premium → 11 modul ochiq)
   - Joriy tuzatishlar (ayniqsa treatment-plans: lab-gate + odontogram yangi API)
   - **Provisioning (2026-08-04):** aktivatsiyadan keyin `/login` sahifasida
     **vendor bergan telefon + vaqtinchalik parol** bilan kiring. Klinika,
     filial, owner hisobi va 8 rol shabloni aktivatsiya paytida avtomatik
     yaratiladi — `/register-tenant` orqali qo'lda yaratish SHART EMAS.

### 4.1 Provisioning'ni sinashdan oldin — ikki majburiy shart

**(a) Lokal baza BO'SH bo'lishi kerak.** Agar mashinada allaqachon tenant
mavjud bo'lsa (masalan avvalgi testda `/register-tenant` orqali yaratilgan),
provisioning **ataylab sokin o'tkazib yuboriladi** va vendor bergan parol
ishlamaydi. Bu xavfsizlik xulqi: aks holda litsenziya kalitiga ega har kim
owner parolini bosib o'tishi mumkin bo'lardi. Log'da `tenant.provisioning_skipped`
ko'rinadi. Sinash uchun `C:\ProgramData\DentalService\` ostidagi Postgres
ma'lumot katalogini o'chirib, toza o'rnatishdan boshlang.

**(b) Yangilashda migratsiya `0043` QONUNIY ravishda TO'XTASHI mumkin.**
`users.phone` endi kanonik `+998XXXXXXXXX` shaklga keltiriladi. Migratsiya avval
to'qnashuvni tekshiradi: normalizatsiyadan keyin ikki foydalanuvchi bir xil
raqamga tushsa `RAISE EXCEPTION` konfliktli `id`/`phone` ro'yxati bilan ishga
tushadi va yangilash to'xtaydi. **Qayta urinish (retry) YORDAM BERMAYDI** —
qaysi hisob haqiqiy ekanini faqat inson hal qila oladi; jim birlashtirish
ataylab qilinmagan. Konflikt chiqsa: xato xabaridagi `id`larni ko'rib,
ortiqcha hisobni o'chiring yoki telefonini o'zgartiring, so'ng yangilashni
qayta ishga tushiring.

### 4.2 Startup gate (`bootstrap-status`) — nimani kutish kerak

Ilova ochilganda Electron lokal API'dan `GET /api/bootstrap-status` so'raydi va
javobga qarab oynani `/activate` yoki asosiy UI'da ochadi
(`apps/desktop/src/license-status.ts` — `fetchBootstrapStatus` / `resolveStartupUrl`).

| Holat | Kutilgan oyna |
|---|---|
| `.lic` yo'q | `/activate` — kalit kiritish formasi |
| `.lic` bor, lokal bazada tenant YO'Q (baza yo'qolgan / yangi PC) | `/activate` — "ta'minotchiga murojaat qiling" matni |
| `.lic` bor + tenant bor | asosiy UI |
| **So'rov javob bermadi** (2s timeout, API hali ko'tarilmagan) | eski `.lic`-asosidagi xulq — gate **bloklamaydi** |

Ikki nozik nuqta, ikkalasi ham **kutilgan xulq**, bug emas:

1. **Sekin boot'da gate jim o'chadi.** So'rov `startApiLayer`dan keyin bir marta
   yuboriladi, API tayyorligi qat'iy kechikish bilan (`DENTAL_API_READY_DELAY_MS`,
   default 2000 ms) taxmin qilinadi — health-check emas. Sekin mashinada javob
   ulgurmasa `null` qaytadi va oyna eski qoida bo'yicha ochiladi. Bu qasddan:
   gate startup'ni hech qachon ushlab qolmasligi shart (spec §3.4). Bunday
   holatda ham foydalanuvchi qopqonda qolmaydi — web `/login` darvozasi
   `bootstrap-status`ni qayta so'rab `/activate`ga uloqtiradi.
2. **Gate faqat STARTUP'da hisoblanadi.** Oyna yopilib tray'dan «Ochish»
   bosilsa, faqat `.lic` tekshiriladi (`licenseGatedUrl`) — tenant yo'q bo'lsa
   asosiy UI ochiladi, keyin SPA `/login`ga, u yerdan `/activate`ga o'tadi
   (bitta ortiqcha sakrash). Eskirgan JWT bilan ham shu yo'l: har so'rov 401 →
   `apps/web/src/lib/api.ts` `window.location.href = '/login'` → gate.
   Ya'ni `/activate`ga borish kafolatlangan, lekin darhol emas.

### 4.3 Qayta o'rnatish / mashina almashtirish (vendor amali)

Mijoz kompyuterini almashtirsa yoki lokal baza yo'qolsa, mijoz tomonida hech
qanday chiqish yo'li YO'Q — aktivatsiya qayta ishlaydi, lekin provisioning bloki
kelmaydi (vaqtinchalik parol birinchi muvaffaqiyatli o'rnatishda o'chirilgan).
Buni **faqat vendor** ochadi:

**Admin panel → klinika → «Qayta o'rnatishga tayyorlash»** — yangi vaqtinchalik
parol yaratadi va `fingerprint`ni tozalaydi. Natijada keyingi `/activate`
istalgan mashinaga bog'lanadi va provisioning blokini oladi.

Uchta xulq testda ajablantirmasligi uchun:

1. **Eski o'rnatma darhol to'xtamaydi.** `fingerprint = NULL` bo'lgach eski
   mashinaning heartbeat'i 403 `NOT_ACTIVATED` oladi, lekin klient faqat
   `INVALID_KEY` da `.lic`ni bekor qiladi — qolgani "vaqtinchalik" deb
   hisoblanadi (offline-resilience). Eski o'rnatma muddat/grace tugagunicha
   ishlashda davom etadi. O'tish davri uchun bu **to'g'ri**; darhol to'xtatish
   kerak bo'lsa litsenziyani **deaktivatsiya** qiling.
2. **Tayyorlangan parol kutib turadi.** U ishlatilmaguncha, amal qayta
   bajarilmaguncha yoki litsenziya deaktivatsiya qilinmaguncha Supervisor
   bazasida qoladi. Agar mijoz bazasi BUTUN mashinada aktivatsiya qilsa,
   provisioning skip bo'ladi va parol **o'chirilmaydi** — u hali kerak.
   Bunday holat `license_events`da `provisioning_skipped` bilan ko'rinadi.
3. **Bir klinikada bir vaqtda ko'pi bilan bitta tayyorlangan parol** — amalni
   qayta bosish eskisini almashtiradi, to'plamaydi.

---

## 5. Caveats / troubleshooting

| Muammo | Yechim |
|---|---|
| SmartScreen ogohlantirishi | Imzosiz installer (CLI-376) — «Run anyway» |
| **API port 80** band yoki admin kerak | `config.serverPort` default 80. Band bo'lsa/admin bo'lmasa API ko'tarilmaydi. Ilovani **administrator** sifatida oching yoki portni o'zgartiring |
| `C:\ProgramData\DentalService` yozib bo'lmaydi | Administrator huquqi bilan oching |
| Binariy yuklanmadi (prebuild) | Windows `http://192.168.3.242/bins/...` ga yeta olishini tekshiring (LAN); yoki qo'lda joylashtiring (§2) |
| Aktivatsiya "invalid signature" | Desktop `main`dagi YANGI public key bilan build qilinganini tekshiring (`packages/core/src/supervisor-public-key.ts`); VM'dagi private kalitga mos |
| Aktivatsiya Supervisor'ga ulanmadi | `SUPERVISOR_URL` env to'g'ri + Windows LAN'da `.242`ga yetadi (brauzerda tekshiring) |
| Postgres/Valkey ko'tarilmadi | `C:\ProgramData\DentalService\logs\{postgres,valkey}.log` ni ko'ring |
| Auto-update ishlamaydi | `UPDATE_URL` sozlanmagan (CLI-377) — qo'lda testда ta'sirsiz |

---

## 6. Qo'shimcha litsenziya yaratish (admin panel)

Brauzerda `http://192.168.3.242` → login (`admin@dental.local` / <deploy paytidagi parol>) →
yoki API orqali:
```bash
TOKEN=$(curl -s -X POST http://192.168.3.242/v1/admin/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@dental.local","password":"<PAROL>"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl -s -X POST http://192.168.3.242/v1/admin/clinics \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Yangi Klinika","plan":"premium","expiresAt":"2027-12-31T00:00:00Z","gracePeriodDays":30,
       "ownerFullName":"Ali Valiyev","ownerPhone":"901234567","defaultLanguage":"uz",
       "branchName":"Bosh filial"}'
# → licenseKey (XXXXX-XXXXX-XXXXX) + credentials { loginPhone, tempPassword }
```
`plan`: `starter` | `standard` | `premium` | `enterprise` (har biri turli modul to'plami — `apps/supervisor-api/src/modules/clinics/clinics.routes.ts` `MODULE_MAP`).

---

## 7. Supervisor'ni boshqarish (VM 103, agar kerak bo'lsa)

```bash
ssh ubuntu@192.168.3.242
cd ~/dental-service/infra/supervisor
export RSA_PRIVATE_KEY="$(cat ~/supervisor-private.pem)"
docker compose -f docker-compose.ip.yml --env-file .env.production ps      # holat
docker compose -f docker-compose.ip.yml --env-file .env.production logs -f api   # loglar
docker compose -f docker-compose.ip.yml --env-file .env.production restart api   # qayta ishga tushirish
```
Binariylar: `~/dental-service/infra/supervisor/bins/` (Caddy `/bins/*` orqali xizmat qiladi).
