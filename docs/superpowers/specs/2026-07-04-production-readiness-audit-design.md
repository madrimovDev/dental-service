# Production Readiness Audit — Linear task-yozish rejasi

**Sana:** 2026-07-04
**Holat:** Approved (brainstorm orqali)

## Maqsad

Loyihaning M0-M14 + Supervisor + Local Desktop (CLI-338) epiklari kod darajasida
"Done" deb belgilangan, va Linear (team Clinik) backlog to'liq bo'sh (100/100
so'nggi issue Done, faqat CLI-176 arxivlangan holda ochiq). Lekin CLAUDE.md
tarixida bir nechta "keyinroq" deb qoldirilgan follow-up va V3 scaffold
qatlamlari bor. Bu spec — ularni tizimli aniqlash va Linear'ga task sifatida
yozish rejasi.

## Qamrov

Ikki guruh, lekin **bitta Linear project**ga yoziladi:
**"Dental Service — Desktop & Supervisor"**.

### Guruh 1 — Local Desktop yakunlash (allaqachon kodda tasdiqlangan, audit shart emas)

1. `requireModule` middleware yozilgan/test qilingan, lekin hech bir route'ga
   qo'llanmagan (`apps/api/src/lib/license-middleware.ts`) — modul-gating
   haqiqatda enforce qilinmayapti.
2. `apps/api/src/routes/uploads.ts` (`GET /uploads/:key`, path-traversal fix
   bilan) `app.ts`da hech qayerda import/mount qilinmagan — local-filesystem
   fayllar (bemor rasmlari) HTTP orqali olinmaydi.
3. Web `/settings` sahifasi Electron IPC bridge'ni chaqirmaydi
   (`window.dentalDesktop.setServerUrl()` — Electron tarafi tayyor,
   `apps/desktop/src/settings-ipc.ts`/`preload.ts`, lekin UI tarafi yo'q).
4. **BLOCKED** — Windows jismoniy tekshiruv: Local Desktop Task 6-12
   (Electron/Windows-only qism) typecheck qilingan, lekin real Windows PC'da
   hech qachon ishga tushirilmagan. Bajaruvchi — foydalanuvchi, Claude emas.

### Guruh 2 — Platform-darajasidagi production-readiness auditi (bajarilishi kerak)

Gibrid metodologiya:

1. **Tez skan** (men o'zim, to'g'ridan-to'g'ri) — `TODO`, `FIXME`, `won't-fix`,
   `deferred`, `scaffold`, `TBD`, "Phase 2", "keyinroq" markerlari bo'yicha
   kodbaza + `docs/rfcs/` + `CLAUDE.md` tarixi bo'ylab grep.
2. **6 ta parallel agent**, har biri mustaqil soha:
   - Backend API (`apps/api`) — mount qilinmagan route/middleware,
     `requirePermission` bo'shliqlari, hardcoded TODO
   - Frontend web (`apps/web`) — i18n bo'shliqlari, "coming soon" stub'lar,
     hardcoded matn
   - Desktop/Supervisor — Guruh 1'dan tashqari boshqa bog'lanmagan uchlar
     (auto-updater code-signing, portable binary integrity va h.k.)
   - V3 tashqi-bog'liq scaffold'lar (`packages/fiscal`, `packages/notifications`
     Telegram, 1C export, insurance) — scaffold vs "real" farqi
   - Docs/RFC/CLAUDE.md tarixi — "deferred"/"won't-fix"/"Phase 2"/"TBD"
     belgilangan qarorlar
   - Infra/deploy/CI — `main` push qilinmagani, CI holati, `infra/`
     production-tayyorligi
3. **Tasdiqlash bosqichi** — har agent topilmasi men tomonimdan qayta
   tekshiriladi (hozir ham to'g'rimi, eskirmaganmi — masalan CLI-182 CLAUDE.md
   da "ochiq" deb yozilgan edi, aslida Linear'da 2026-06-22'dan Done). Faqat
   tasdiqlangan topilmalar Linear'ga yoziladi.

## Linear'ga yozish formati

- **Project:** barcha task — "Dental Service — Desktop & Supervisor" (taqsimlanmaydi).
- **Sarlavha:** qisqa, harakat fe'li bilan.
- **Tavsif:** nima yetishmayapti + nega muhim + `file:line` dalili.
- **Tashqi-bog'liq itemlar** (Soliq real cred, Telegram bot token, 1C XSD,
  Windows PC) — tavsifda aniq **"BLOCKED: <kerak bo'ladigan tashqi input>"**
  belgisi bilan yoziladi. Claude ularni boshlay olmaydi, lekin task sifatida
  ko'rinib turadi.
- **Priority:** default Medium; xavfsizlik/korrektlik bo'shliqlari uchun High;
  kosmetik/polish uchun Low.

## Muvaffaqiyat mezoni

- Guruh 1'ning 4 tasi Linear'da mavjud.
- Guruh 2 uchun 6 sohadan kelgan barcha topilmalar tasdiqlangan holda (yoki
  rad etilgan bo'lsa sababi bilan log qilingan) Linear'ga yozilgan — hech
  qanday "sokin" tashlab yuborish yo'q.
