# Supervisor landing + yuklab olish sahifasi — dizayn

**Sana:** 2026-08-07
**Holat:** tasdiqlangan, implementatsiya kutilmoqda

## 1. Muammo

Windows desktop installer (`Dental Service Setup <ver>.exe`, ~135 MB) hozir faqat
build qilingan mashinada yotadi. Uni beta klinikaga yetkazishning yagona yo'li —
qo'lda ko'chirish (flashka/scp). Loyihaning o'zi haqida ham hech qanday qisqa
tanishtiruv sahifasi yo'q.

Kerak: Supervisor VM'da turadigan kichik sahifa — installerni yuklab olish +
loyihaning bir ekranlik «visitka»si.

## 2. Qamrov

**Kiradi:** ichki LAN uchun statik sahifa, installer hosting, versiya
ma'lumotini yangilab turuvchi publish skripti.

**Kirmaydi:** ommaviy internet, domen, TLS, marketing matni, ekran rasmlari,
modul tavsiflari, auto-update serveri (`UPDATE_URL` hozir ishlatilmaydi),
ko'p tillilik.

**Auditoriya:** ta'minotchi (o'zim) va beta klinika. Faqat `192.168.3.x`
tarmog'idan ochiladi.

**Til:** o'zbek. Loyihaning asosiy tili va mijoz lokal — ru versiyasi hozir
qo'shilmaydi.

## 3. Qarorlar va sabablari

### 3.1 Manzil `/start`, admin `/` da qoladi

Caddy'ga faqat yangi bloklar qo'shiladi; `/`, `/v1/*`, `/bins/*` marshrutlariga
TEGILMAYDI. Sabab: Windows E2E testi oldidan ishlayotgan tizimga tegish xavfi
foydadan katta. Admin SPA'ni `/admin` ga ko'chirish (Vite `base` + React Router
`basename`) mantiqan toza bo'lardi, lekin qayta build va regressiya xavfini
keltiradi — keyinroq, alohida ish sifatida ko'rilishi mumkin.

### 3.2 Statik HTML, workspace app EMAS

`infra/supervisor/landing/index.html` — bitta fayl, inline CSS, build bosqichi
yo'q. Bu vendor infratuzilmasi, dental mahsulotning qismi emas; `apps/` ostiga
yangi Vite ilovasi qo'shish (bundler, bog'liqliklar, typecheck, CI) bir ekranlik
statik sahifa uchun nomutanosib.

Tashqi resurs (CDN, shrift, analitika) ISHLATILMAYDI — sahifa internetsiz LAN'da
ham to'liq ochilishi shart.

### 3.3 Fayl nomi barqaror, versiya JSON'da

Installer VM'da **versiyasiz** nom bilan turadi (`dental-service-setup.exe`) va
har relizda ustiga yoziladi. Versiya/hajm/sana/SHA-256 yonidagi
`release.json` da.

Sabab: yuklab olish tugmasining `href`i **statik** bo'ladi. Agar versiya fayl
nomida bo'lsa, sahifa havolani qura olishi uchun JSON'ga bog'liq bo'lib qoladi
va JSON tushganda tugma butunlay buziladi. Barqaror nom bilan JSON faqat
**boyitadi**: yuklanmasa versiya/hajm o'rniga `—` ko'rsatiladi, tugma esa
ishlayveradi.

### 3.4 `bins/` emas, alohida `releases/`

`bins/` — build KIRISHLARI (Windows Postgres/Valkey zip'lari, `prebuild`
iste'mol qiladi). `releases/` — mijozga beriladigan CHIQISH artefakti. Ikkalasini
aralashtirmaslik semantikani toza saqlaydi.

### 3.5 Sahifada kredensial YO'Q

Litsenziya kaliti, owner telefoni va vaqtinchalik parol sahifada ko'rsatilmaydi —
ular har klinikaga xos, sahifa esa umumiy va autentifikatsiyasiz. O'rnatish
yo'riqnomasida «ta'minotchidan olgan litsenziya kaliti» deb yoziladi.

## 4. Fayl tarkibi

```
infra/supervisor/
├── landing/
│   └── index.html          # yangi — sof statik, inline CSS
├── releases/               # yangi — .gitignore'da (katta binariylar)
│   ├── dental-service-setup.exe
│   └── release.json
├── Caddyfile.ip            # o'zgaradi — 2 ta yangi handle bloki
└── docker-compose.ip.yml   # o'zgaradi — 2 ta yangi volume mount

scripts/
└── publish-desktop-build.sh  # yangi
```

`.gitignore` ga qo'shiladi: `infra/supervisor/releases/`

## 5. Komponentlar

### 5.1 `landing/index.html`

Bitta ekranga sig'adigan sahifa, quyidagi tartibda:

1. **Sarlavha** — «Dental Service» + bir jumlalik ta'rif (klinika boshqaruv
   tizimi: bemor, yozilish, navbat, kassa, klinik yozuvlar).
2. **Yuklab olish** — katta tugma, `href="/download/dental-service-setup.exe"`
   (statik). Ostida: `versiya · hajm · sana` — `release.json`dan to'ldiriladi,
   yuklanmasa `—`.
3. **O'rnatish — 4 qadam:**
   - SmartScreen «Windows protected your PC» → «More info» → «Run anyway»
     (installer imzosiz)
   - O'rnatishda rol: **server**
   - `SUPERVISOR_URL` environment o'zgaruvchisini `http://192.168.3.242` qilib
     qo'yish — qiymat sahifada OCHIQ ko'rsatiladi (sir emas, sahifaning o'zi
     shu manzilda turibdi) va PowerShell buyrug'i bilan birga beriladi
   - Ta'minotchidan olingan litsenziya kalitini kiritish
4. **Tizim talablari** — Windows 10/11 64-bit, ~2 GB bo'sh joy, klinika
   tarmog'iga ulanish.
5. **Aloqa** + kichik matnda SHA-256 (JSON'dan; yuklanmasa bo'lim yashiriladi).

   Aloqa qiymatlari (telefon / Telegram) — implementatsiya paytida
   foydalanuvchi beradi. Berilmasa bo'lim butunlay tushiriladi; sahifaga
   to'ldirilmagan namuna qiymat («+998 XX ...») YOZILMAYDI.

Sahifa `fetch('/download/release.json')` qiladi. Xato yoki noto'g'ri JSON —
`catch` ichida jimgina yutiladi, sahifa ishlashda davom etadi.

### 5.2 `release.json`

```json
{
  "version": "0.1.0",
  "size": 141617870,
  "sha256": "fd1e2aa617062a2bfbbca26e9f046f55775da4ab3c0561c4bf08ac555db11084",
  "publishedAt": "2026-08-07T12:00:00.000Z"
}
```

`version` — `apps/desktop/package.json`dan o'qiladi (build nomi bilan mos
bo'lishi uchun qo'lda kiritilmaydi).

### 5.3 `Caddyfile.ip`

Mavjud `handle` bloklaridan KEYIN, oxirgi umumiy `handle { reverse_proxy
admin:80 }` dan OLDIN:

```
handle_path /start* {
    root * /srv/landing
    file_server
}

handle_path /download/* {
    root * /srv/releases
    file_server
}
```

Tartib muhim: Caddy `handle` bloklarini yozilish tartibida sinaydi va umumiy
`handle` hamma narsani ushlaydi.

### 5.4 `docker-compose.ip.yml`

`caddy` xizmatiga ikkita read-only mount:

```yaml
- ./landing:/srv/landing:ro
- ./releases:/srv/releases:ro
```

### 5.5 `scripts/publish-desktop-build.sh`

Bitta buyruq bilan reliz chiqaradi:

1. Installer yo'lini aniqlaydi (default `apps/desktop/release/Dental Service
   Setup <ver>.exe`, `<ver>` — `apps/desktop/package.json`dan).
2. Fayl mavjudligini va PE binariy ekanini tekshiradi (`file` chiqishida
   `PE32`). Bu Linux'da `--target` bayrog'i tushib qolgan holatni ushlaydi —
   aynan shu tuzoq 2026-08-07 da topilgan edi.
3. Hajm va SHA-256 ni hisoblaydi, `release.json` yozadi.
4. `.exe` (barqaror nom bilan) va `release.json` ni VM'ga rsync qiladi.
5. Deploy-keyingi tekshiruv: `/start` → 200, `/download/dental-service-setup.exe`
   → 206 (range so'rov), `/download/release.json` → to'g'ri JSON va hajmi
   yuklangan fayl hajmiga mos.

Xost env orqali: `TARGET_HOST` (default `ubuntu@192.168.3.242`), `TARGET_DIR`
(default `dental-service/infra/supervisor/releases`).

## 6. Xavflar va ehtiyot choralari

**Daraxt rsync'i installerni o'chirib yuborishi.** Loyiha daraxtini VM'ga
`rsync --delete` bilan sinxronlaganda `infra/supervisor/releases` ni ham
`--exclude` qilish SHART — aynan `bins` bilan bir xil sabab. Bu `docs/
DESKTOP-WINDOWS-BUILD-TEST.md` dagi rsync buyrug'iga ham qo'shiladi.

**Caddy blok tartibi.** Yangi bloklar umumiy `handle` dan oldin turishi kerak,
aks holda ular hech qachon ishlamaydi va sahifa o'rniga admin SPA ochiladi.

**Katta fayl git'ga tushishi.** `.gitignore` qatori birinchi commit'da
qo'shiladi, `releases/` papkasi yaratilishidan oldin.

## 7. Tekshirish

Statik sahifa uchun unit test yozilmaydi — sinaydigan mantiq yo'q, test faqat
HTML tarkibini takrorlagan bo'lardi. Haqiqiy tekshiruv:

- **Avtomatik:** publish skriptining o'zidagi deploy-keyingi `curl` tekshiruvlari
  (§5.5 qadam 5). Skript ular yiqilsa nol bo'lmagan kod bilan chiqadi.
- **Qo'lda, bir marta:** (a) sahifa brauzerda ochiladi va tugma faylni yuklaydi;
  (b) `release.json` ni vaqtincha buzib, tugma hamon ishlashini va versiya
  o'rniga `—` chiqishini ko'rish (§3.3 dagi qarorning butun ma'nosi shunda).

## 8. Bajarilgan deb hisoblash mezoni

- `http://192.168.3.242/start` sahifani ochadi
- Tugma bosilganda installer yuklanadi, hajmi `release.json` dagiga mos
- `release.json` o'chirilsa/buzilsa sahifa ochiladi va tugma ishlaydi
- `/`, `/v1/*`, `/bins/*` — avvalgidek ishlaydi (regressiya yo'q)
- `publish-desktop-build.sh` ni qayta ishga tushirish versiyani yangilaydi
