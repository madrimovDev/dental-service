# Windows Desktop — Build & Test Runbook (CLI-361)

> Bu hujjat desktop (Electron) ilovani Windows'da build qilish va real Supervisor'ga qarshi
> test qilish uchun. Supervisor allaqachon deploy qilingan (2026-07-11) — quyidagi qiymatlar tayyor.
> Tegishli: `docs/superpowers/specs/2026-07-11-treatment-flow-audit-workflow-design.md` emas —
> desktop qismi: `infra/supervisor/`, `apps/desktop/`, `scripts/download-portable-bins.sh`.

---

## 0. Deploy holati — Supervisor TAYYOR (2026-07-11)

Supervisor **VM 103** (`server3`, `192.168.3.242`) da ishlayapti (IP/HTTP, domensiz test rejimi).
Yangi RSA keypair generatsiya qilingan; desktop build baked public key (`packages/core/src/supervisor-public-key.ts`) shunga mos.

| Nima | Qiymat |
|---|---|
| `SUPERVISOR_URL` | `http://192.168.3.242` |
| `POSTGRES_WIN_URL` | `http://192.168.3.242/bins/postgres-16-win.zip` |
| `VALKEY_WIN_URL` | `http://192.168.3.242/bins/valkey-win.zip` |
| Test litsenziya kaliti | `CB628-48559-B871D-69758` (premium, 11 modul, 2027-12-31 gacha) |
| Admin panel | `http://192.168.3.242` (login: `admin@dental.local` / parol — deploy paytida generatsiya, chatда berilgan, bu hujjatga commit qilinmadi) |

> ⚠️ **Tarmoq:** bu IP **ichki LAN** (`192.168.3.x`). Windows mashina shu tarmoqda bo'lishi shart
> (masalan VM 102 `.245`, yoki LAN'dagi shaxsiy PC). Tashqarida bo'lsa — Supervisor'ni Traefik
> (LXC 200) orqali domenga chiqarish kerak (alohida qadam).
>
> ⚠️ **Valkey:** rasmiy Valkey Windows binariysi yo'q. `valkey-win.zip` ichidagi `valkey-server.exe`
> aslida **tporadowski Redis 5.0.14** (renamed) — BullMQ Streams'ni qo'llab-quvvatlaydi, `valkey-win.conf`
> bilan mos. **Test uchun ishlaydi**; production uchun to'g'ri Valkey Windows yechimi keyin ko'riladi.

---

## 1. Windows prerequisites

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
4. Litsenziya kalitini kiriting: **`CB628-48559-B871D-69758`** → aktivatsiya → ilova yuklanadi.
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
