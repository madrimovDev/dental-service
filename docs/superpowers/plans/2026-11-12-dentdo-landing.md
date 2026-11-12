# Dentdo landing — bajarish rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dentdo sotuv sahifasini (uz/ru, statik) `dental.madrimov.uz` da ishga tushirish, ilovani `app.dental.madrimov.uz` ga ko'chirish, sinovni 30 kunga va nomni «Dentdo» ga o'zgartirish.

**Architecture:** `apps/landing` — bitta HTML shablon + `uz.json`/`ru.json` lug'atlari; bun skripti `dist/` ga ikkita statik sahifa (`/`, `/ru/`) va maxfiylik sahifalarini yig'adi. Host Caddy `dist`ni `file_server` bilan beradi; ilova alohida `app.` hostida. Skrinshotlar lokal namuna klinikasidan olinib, repo'ga WebP sifatida qo'shiladi (yig'ish sof — tarmoqsiz).

**Tech Stack:** Bun (skript + `bun test`), statik HTML/CSS, minimal vanilla JS, Caddy, playwright-core (skrinshot).

**Spec:** `docs/superpowers/specs/2026-11-12-dentdo-landing-design.md` (D1–D9, M1–M15, §7). Tasdiqlangan maket: `.superpowers/brainstorm/2542951-1794498371/content/landing-v2.html` (gitignored — T4 uni `apps/landing/src/template.html` ga ko'chirib boshlaydi). Dizayn tizimi: https://claude.ai/artifact/BmUmJ67uVQN2zNAaQpuoqF (tokenlar maket `:root`ida allaqachon bor).

## Global Constraints

- Narxlar aynan: 149 000 / 299 000 / 549 000 so'm/oy; yillik 1 490 000 / 2 990 000 / 5 490 000; Start 1–2, Klinika 3–5, Pro 6–10 shifokor; Start va Klinika «1 filial», Pro «Bir nechta filial».
- Sinov — **30 kun**, «karta kerak emas». Aloqa: `+998 95 044 50 14`, Telegram `@madrimov`.
- Asosiy tugma → `/start` (Caddy `redir` → `https://app.dental.madrimov.uz/register-tenant`).
- Faqat dasturda bor imkoniyatlar (spec §5 ro'yxati). §7 va'dalari qoladi.
- Emoji belgi, stok foto, tashqi analitika/skript YO'Q. Tashqi resurs faqat Google Fonts (Manrope).
- 360px kenglikda gorizontal skroll yo'q; matn kontrasti ≥ 4.5:1 ikkala mavzuda.
- Desktop: `productName`, mDNS servis nomi (`discovery.ts`), firewall qoidasi nomi, `C:\ProgramData\DentalService` yo'llari **o'zgarmaydi** (identifikator; o'zgarsa userData/kashf qilish/installer buziladi, Windows sinovdan o'tmagan). Faqat foydalanuvchiga ko'rinadigan matnlar «Dentdo».
- Prod VPS'da boshqa loyihalar bor: faqat `/etc/caddy/sites/dental-*.caddy`, `caddy validate` → `reload`; sirlar chiqarilmaydi.

## Review Focus

1. **Rus sahifasi uz bilan farq qilib qolishi** (narx, havola, bo'lim yetishmasligi) — T4: lug'at kalitlari to'plami bir xil ekanini va har sahifada narx satrlari borligini tekshiruvchi test.
2. **Eski ilova havolalari** (`dental.madrimov.uz/login`, `/select-workspace`, Telegram xabaridagi eski havola) sahifa 404 beradi — T3: Caddy'da 308 yo'naltirishlar va jonli `curl` tekshiruvi (T6).
3. **`/start` bosilmasa ham ishlashi** — JS o'chiq bo'lsa tugma oddiy `<a href="/start">`; T4 testida barcha CTA'lar `href="/start"` (yoki `/ru/` uchun ham `/start`).
4. **Telefonda hero sahnasi** sahifani kengaytirishi — T4: 360px da `scrollWidth === 360` render testi.
5. **Qorong'i mavzuda o'qilmaydigan blok** (literal rangli matn) — T4: render tekshiruvi `prefers-color-scheme: dark` da ham skrinshot; T6 da ko'z bilan ko'rish.

---

### Task 1: SaaS sinov muddati 30 kun

**Files:**
- Modify: `apps/supervisor-api/src/modules/saas/saas.routes.ts:18`
- Test: `apps/supervisor-api/src/modules/clinics/clinics.test.ts:585-595`

- [ ] **Step 1:** Testni yangilang: nom «30 kunlik sinov», kutilgan kunlar `> 29.9` va `< 30.1`.
- [ ] **Step 2:** `cd apps/supervisor-api && bun test src/modules/clinics/clinics.test.ts -t "mode=saas"` → FAIL (14 kun).
- [ ] **Step 3:** `export const SAAS_TRIAL_DAYS = 30;`
- [ ] **Step 4:** O'sha test → PASS; `grep -rn "14 kun\|14 дн\|14-day" apps packages --include='*.json' --include='*.ts*' | grep -iv test` — sinovga oid qolgan matn bo'lsa 30 ga.
- [ ] **Step 5:** Commit `feat(saas): sinov muddati 30 kun (Dentdo taklifi)`.

### Task 2: Ko'rinadigan nom «Dentdo»

**Files:**
- Modify: `apps/web/index.html` (title), `packages/i18n/src/locales/uz.json` va `ru.json` (`app.name`, 149-qator `activate.description` matni), `apps/desktop/src/tray.ts:55`, `apps/desktop/src/auto-updater.ts:120-121`, `apps/desktop/src/main.ts:329,345,382`, `apps/desktop/resources/web/index.html` (agar repo'da kuzatilsa), `apps/supervisor-admin/index.html` → `Dentdo Supervisor`, `apps/lab-hub-web/index.html` → `Dentdo · Laboratoriya portali`, `apps/api/scripts/generate-openapi.ts` (spec `info.title` → `Dentdo API`, keyin `bun run generate:openapi && bun run generate:api-client`).
- Test: `apps/desktop/src/auto-updater.test.ts:82-84` (kutilgan matn «Dentdo»).

- [ ] **Step 1:** `auto-updater.test.ts` kutilgan qiymatlarini «Dentdo — yangilash tayyor» / «Dentdo» ga o'zgartiring → `cd apps/desktop && bun x vitest run src/auto-updater.test.ts` FAIL.
- [ ] **Step 2:** Yuqoridagi fayllarda foydalanuvchiga ko'rinadigan «Dental Service» → «Dentdo». Global Constraints'dagi identifikatorlarga tegilmaydi (`discovery.ts:42` `name`, `installer.nsh` firewall nomi, `electron-builder.yml productName`, `ProgramData\DentalService`).
- [ ] **Step 3:** Desktop testi PASS; `python3 -I scripts/i18n-merge.py` kerak emas (konflikt yo'q); `bunx turbo typecheck --force` toza; `grep -rn "Dental Service" apps/web/src packages/i18n/src` → bo'sh.
- [ ] **Step 4:** Commit `chore(brand): foydalanuvchiga ko'rinadigan nom Dentdo`.

### Task 3: Infra — ilova `app.` hostiga, landing asosiy hostda

**Files:**
- Create: `infra/vps/caddy/dental-app.caddy` — `app.dental.madrimov.uz`: hozirgi `dental-cloud.caddy` mazmuni (`/api/*`, `/uploads/*` → 4101, qolgani → 4100, `header_up X-Real-IP`, xavfsizlik sarlavhalari).
- Modify: `infra/vps/caddy/dental-cloud.caddy` → `dental.madrimov.uz` landing:
  - `redir /start https://app.dental.madrimov.uz/register-tenant 302`
  - `@app path /login /register-tenant /select-workspace /change-password-required /reset-owner-password /activate /api/* /uploads/*` → `redir @app https://app.dental.madrimov.uz{uri} 308`
  - qolgani: `root * /srv/dental/landing`, `try_files {path} {path}/index.html`, `file_server`, `encode zstd gzip`; `/assets/*` uchun `Cache-Control "public, max-age=31536000, immutable"`, HTML uchun `no-cache`; `handle_errors` 404 → `/404.html`.
  - CSP: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'`.
- Modify: `infra/vps/gen-secrets.sh` (`CLOUD_HOST` default `app.dental.madrimov.uz`), `infra/vps/deploy.sh` (yangi `landing` maqsadi: `docker run --rm -v "$PWD":/w -w /w/apps/landing oven/bun:1.2 sh -c "bun run build"` yoki serverdagi `bun`; `rsync -a --delete apps/landing/dist/ /srv/dental/landing/`; `all` ichiga qo'shiladi), `infra/vps/README.md` (domen jadvali, landing qatori, `/start`, ko'chish izohi).

- [ ] **Step 1:** Lokal `caddy` bo'lmasa `docker run --rm -v "$PWD/infra/vps/caddy":/c caddy:2-alpine caddy validate --adapter caddyfile --config /c/dental-cloud.caddy` (har fayl uchun) → `Valid configuration`.
- [ ] **Step 2:** `bash -n infra/vps/deploy.sh infra/vps/gen-secrets.sh` toza.
- [ ] **Step 3:** Commit `infra(vps): landing asosiy hostda, ilova app. hostida`.
  (Serverdagi `cloud.env` `WEB_ORIGIN` ni o'zgartirish va qayta ishga tushirish — T6, controller.)

### Task 4: `apps/landing` — shablon, lug'at, yig'ish

**Files:**
- Create: `apps/landing/package.json` (`@dental/landing`, private, scripts: `build: bun run scripts/build.ts`, `test: bun test`, `typecheck: tsc --noEmit`), `apps/landing/tsconfig.json`, `apps/landing/src/template.html` (maket v2'dan: mockbar olib tashlanadi; matnlar `{{key}}` o'rinbosarlari; skrinshot joylari `<img src="/assets/shots/{{lang}}/<name>.webp" width height alt="{{shot.<name>.alt}}">` — rasm hali yo'q bo'lsa build maketdagi HTML-chizmani `<noscript>`siz fallback qilib qoldiradi), `apps/landing/src/i18n/uz.json`, `ru.json`, `apps/landing/src/privacy.html` + lug'atdagi `privacy.*`, `apps/landing/src/404.html`, `apps/landing/src/app.js` (yillik/oylik almashtirgich: `data-monthly`/`data-yearly` matnlarini almashtiradi; boshqa JS yo'q), `apps/landing/src/og.svg` → build'da `og.png` emas, `og.svg` + `<meta property="og:image">` uchun 1200×630 PNG T5 skriptida olinadi, `apps/landing/scripts/build.ts`, `apps/landing/scripts/build.test.ts`.
- Modify: `.gitignore` (`apps/landing/dist`).

**Interfaces:**
- Produces: `buildSite(opts: { srcDir: string; outDir: string }): Promise<{ pages: string[] }>` (`scripts/build.ts`) — `outDir/index.html` (uz), `outDir/ru/index.html`, `outDir/privacy/index.html`, `outDir/ru/privacy/index.html`, `outDir/404.html`, `outDir/assets/**` (app.js, shots, og). Har sahifada: `<html lang>`, `<title>`, `meta description`, `link rel=canonical` (`https://dental.madrimov.uz/` yoki `/ru/`), ikki `hreflang` + `x-default`, OG teglari, til almashtirgich havolasi.
- T5 shu yo'lga yozadi: `apps/landing/src/assets/shots/{uz,ru}/{calendar,owner-phone,telegram,booking,tooth-chart,cashier,queue,reports,payroll}.webp`, `apps/landing/src/assets/og.png`.

- [ ] **Step 1: Failing test** `scripts/build.test.ts`:
  - `uz.json` va `ru.json` kalitlar to'plami teng (rekursiv).
  - `buildSite` `pages` ichida 5 ta yo'l bor; har sahifada `{{` qolmagan.
  - uz va ru bosh sahifalarida `149 000`, `299 000`, `549 000`, `1 490 000`, `2 990 000`, `5 490 000`, `30` (sinov), `+998 95 044 50 14`, `@madrimov` bor.
  - Barcha «bepul boshlash» CTA'lar (`[data-cta]`) `href="/start"`.
  - `hreflang="uz"`, `hreflang="ru"`, `hreflang="x-default"` bor; canonical to'g'ri.
  - Tashqi `<script src>` yo'q; tashqi `<link href>` faqat `fonts.googleapis.com`.
- [ ] **Step 2:** `cd apps/landing && bun test` → FAIL (`buildSite` yo'q).
- [ ] **Step 3:** `buildSite` ni yozing: shablonni o'qish, `{{a.b}}` ni lug'atdan almashtirish (topilmasa xato tashlaydi), `{{lang}}`, ru uchun yo'llar prefiksi; `src/assets` ni nusxalash; maket CSS'ini `<style>` ichida qoldirish. Rus matnlari ma'nosi uz bilan bir xil (spec §6).
- [ ] **Step 4:** `bun test` → PASS; `bun run build`.
- [ ] **Step 5: Render tekshiruvi** (bir martalik skript, commit qilinmaydi, `scratchpad`da): `dist/index.html` va `dist/ru/index.html` ni Chromium'da 1440 va 360 kenglikda, light va dark (`colorScheme`) ochib: `document.documentElement.scrollWidth` 360 da `=== 360`; skrinshotlarni ko'z bilan ko'ring (qorong'i mavzuda literal ranglar o'qiladimi).
- [ ] **Step 6:** Root `package.json` workspaces `apps/*` qamrab oladi (tekshiring); `bunx turbo typecheck --filter @dental/landing`.
- [ ] **Step 7:** Commit `feat(landing): Dentdo sotuv sahifasi (uz/ru statik)`.

### Task 5: Namuna klinika va skrinshotlar

**Files:**
- Create: `scripts/ui/seed-demo-clinic.ts` (HTTP orqali real API: `register-tenant` «Smile Dental» → 3 shifokor (Dr. Karimova, Dr. Aliyev, Dr. Rahimov) taklif + parol almashtirish → xizmatlar, ~25 bemor (o'ylab topilgan o'zbek ismlari, `+99890…` soxta raqamlar), bugungi va ertangi yozilishlar (maketdagi kalendar bilan bir xil), kassa to'lovlari va 3–4 qarz, navbat holatlari, bitta bemorga tish xaritasi (16 plomba, 46 karies, 11/21 toj) va penitsillin allergiyasi, ombor 2 material (biri kam), ish haqi foizlari. Natija: `creds.json` (scratchpad'ga).
- Create: `scripts/ui/landing-shots.ts` — `app-shot.ts` naqshida login, har ekranni uz va ru (foydalanuvchi tili `preferred_language`/UI til almashtirgich) bilan olish; elementga qarab kesish; PNG → WebP Chromium'da (`canvas.toDataURL('image/webp', 0.86)`), `apps/landing/src/assets/shots/<lang>/<name>.webp` ga yozish; `og.png` — `apps/landing/src/og.svg` ni 1200×630 da render qilish.
- Modify: `apps/landing/src/template.html` — HTML-chizmalar o'rniga `<img>` (T4 joylari), `width/height` aniq.

- [ ] **Step 1:** Lokal stek: `docker compose -f infra/docker-compose.yml up -d`, API + web (orkestratsiya qo'llanmasi; alohida test bazasi `dental_landing_shots`).
- [ ] **Step 2:** `bun scripts/ui/seed-demo-clinic.ts --base http://localhost:<port> --out <scratchpad>/demo-creds.json` → 0 xato, yozuvlar soni chiqadi.
- [ ] **Step 3:** `bun scripts/ui/landing-shots.ts --base … --creds … --out apps/landing/src/assets` → 18 ta webp + og.png; har biri < 180 KB.
- [ ] **Step 4:** `cd apps/landing && bun test && bun run build`; T4 Step 5 render tekshiruvini qayta (rasmlar bilan).
- [ ] **Step 5:** Commit `feat(landing): haqiqiy ilova skrinshotlari (namuna klinika)`.

### Task 6: Deploy va jonli tekshiruv (controller)

- [ ] **Step 1:** To'liq gate (orkestratsiya qo'llanmasi): `bunx turbo typecheck --force`, web build, `check:rls`, API/web/desktop/supervisor/lab-hub to'plamlari, `apps/landing` `bun test`.
- [ ] **Step 2:** `git archive` → `/srv/dental/src`; serverda `cloud.env` da `WEB_ORIGIN=https://app.dental.madrimov.uz` (faqat shu qator `sed`, qiymat chiqarilmaydi); `./infra/vps/deploy.sh supervisor` (30 kun) va `cloud` (nom, WEB_ORIGIN) va `landing`.
- [ ] **Step 3:** `sudo install` `dental-app.caddy` + yangilangan `dental-cloud.caddy` → `caddy validate` → `systemctl reload caddy`; `/etc/caddy/README.md` jadvaliga `dental-app.caddy` qatori.
- [ ] **Step 4:** Jonli tekshiruv:
  - `curl -sI https://dental.madrimov.uz/` 200 `text/html`; `/ru/` 200; `/privacy/` 200; `/yoq` 404.
  - `curl -sI https://dental.madrimov.uz/start` → 302 `app.dental…/register-tenant`.
  - `curl -sI https://dental.madrimov.uz/login` → 308 `app.dental…/login`; `/api/health` → 308.
  - `https://app.dental.madrimov.uz/api/health` 200; brauzerda `/register-tenant` ochiladi va yangi klinika `subscriptionExpiresAt` ≈ +30 kun (Supervisor'da).
  - Boshqa saytlar (woodo.uz, updates, bulut.madrimov.uz) avvalgi kodlari bilan.
- [ ] **Step 5:** Hujjatlar: FINDINGS (yangi §27 landing), CLAUDE.md yuqori blok, `infra/vps/README.md`; commit + push.
