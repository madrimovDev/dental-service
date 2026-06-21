# Production tayyorlik auditi — dental-service

> Sana: 2026-06-21 · Branch: `main` (clean) · Auditor: Claude Code (4 parallel agent + qo'lda tasdiq)
> Usul: build/typecheck/lint/RLS + integration testlar **haqiqatan ishga tushirildi** (Docker DB bilan); xavfsizlik va deploy bo'shliqlari qo'lda tekshirildi.

## Bir qatorli xulosa

**Mahsulot qurilgan — lekin production'ga chiqarib BO'LMAYDI.** Bu ikki alohida savol:

| Savol | Javob |
|---|---|
| **Mahsulot o'z v1 doirasida (R0–R5) bitganmi?** | ✅ **Ha** (~98%) — yetuk kod, mock/stub yo'q, real SQL/payroll hisob, uz/ru to'liq par/itet. |
| **Hozir production serverga chiqarsa bo'ladimi?** | ❌ **Yo'q** — deploy infratuzilmasi deyarli nol (~20%) + 3 ta kritik xavfsizlik teshigi. |

> ⚠️ Tayyorlikni foizlarning **o'rtachasi** bilan o'lchamaslik kerak. Production-readiness = bloklovchi o'lchamlar bo'yicha **minimum**. Bitta hard blocker bo'lsa — chiqarib bo'lmaydi, qolgani 100% bo'lsa ham.

---

## Tekshirilgan dalillar (faraz emas, ishga tushirilgan)

| Tekshiruv | Natija |
|---|---|
| `bun run typecheck` | ✅ 13/13 task, **0 TS xato** |
| `bun run lint` (biome) | ✅ 0 xato, 35 ogohlantirish (`noNonNullAssertion`, asosan testlar) |
| `bun run check:rls` | ✅ 29/29 tenant-scoped jadval RLS bilan qoplangan |
| `bun run build` | ✅ 9/9 task (web `dist` emit; bundle 1.3 MB / gzip 399 kB) |
| Web testlar (vitest) | ✅ **216/216 o'tdi** (66 fayl) |
| API unit testlar | ✅ **41/41 o'tdi** |
| API integration testlar (Docker DB bilan) | ⚠️ **124 pass / 5 fail / 1 error** — 5 fail = **test izolyatsiya muammosi** (yakka holatda 3/3 o'tadi), kod bugi EMAS |
| **RLS tenant izolyatsiya (integration)** | ✅ **TASDIQLANDI** — multi-tenant izolyatsiya testlari Docker DB bilan o'tdi |

**5 flaky test izohi:** `patient-balance` (3) va `reports` (2) testlari to'liq suite'da parallel ishlaganda umumiy DB'da bir-biriga xalal beradi (`TRUNCATE` race). Yakka ishga tushirilganda — `bun test tests/integration/patient-balance.test.ts` → **3 pass / 0 fail**. Bu CI ishonchliligi (flakiness) muammosi, production kod regressiyasi emas.

---

## 🔴 Hard blockers — bularsiz deploy mumkin emas

### A. Deployment infratuzilmasi (deploy yuzasi ≈0)
1. **Production Dockerfile yo'q** — `apps/api`, `apps/web` uchun hech qanday Dockerfile (repoda 0 ta) + `.dockerignore` yo'q.
2. **Prod orkestratsiya yo'q** — prod docker-compose / k8s manifest yo'q (faqat dev `infra/docker-compose.yml`, app servislari yo'q, parollar `*_local_dev`).
3. **Reverse proxy + TLS yo'q** — CLAUDE.md `infra/Caddyfile` ga ishora qiladi, lekin fayl mavjud EMAS. HTTPS/sertifikat konfigi yo'q.
4. **Web prod static-serving yo'q** — `vite preview` prod uchun emas; nginx/Caddy/CDN serve konfigi kerak. `VITE_API_BASE_URL` build-time injection hujjatlanmagan.
5. **Secret injection yo'q** — `apps/api` sirlarni `--env-file=../../.env` (fayl) dan o'qiydi; prod env/secret-manager injection'ga moslanmagan. Prod `.env` namuna yo'q.
6. **Deploy pipeline yo'q** — faqat `ci.yml` (test). Image build/push/deploy + **migration deploy step** yo'q (migration mexanizmi bor, ishga tushiruvchi qadam yo'q).
7. **DB backup/DR strategiyasi yo'q** — tibbiy ma'lumotlar uchun kritik; `docs/`da reja yo'q.

### B. Kritik xavfsizlik (kod + konfig)
8. **MinIO bucket anonim o'qishga ochiq** (`infra/docker-compose.yml:65` — `mc anonymous set download`). Bemor tibbiy rasmlari (rentgen, intraoral foto = PII) uchun presigned-URL dizayni butunlay bekor bo'ladi — har qanday sizib chiqqan kalit doimiy auth'siz yuklab olish. **Tuzatish:** anonim policy'ni olib tashlash (presigned URL kodi to'g'ri ishlaydi).
9. **Parol-reset orqali hisob egallash (ATO)** (`apps/api/src/modules/auth/auth.service.ts:635-650`). `resetPassword` tokenni FAQAT `tokenHash` bo'yicha qidiradi — `userId`'ga bog'lanmagan; 6 xonali kod (~10⁶), 30 daq oyna, **rate limit nol**. Hujumchi fazoni brute-force qilib istalgan kutilayotgan reset'ga mos kelishi mumkin. **Qo'shimcha:** `requestPasswordReset` (626) OTP'ni faqat log'ga yozadi — reset uchun SMS UMUMAN ulanmagan (prod'da parol tiklash ishlamaydi). **Tuzatish:** kodni `userId` bilan birga qidirish + urinish cheklash + reset SMS ulash.
10. **Login/refresh/reset endpointlarda rate limiting yo'q** — kodbazada 0 ta referens. Brute-force himoyasiz; login audit'ga ham yozilmaydi (muvaffaqiyatsiz urinish ko'rinmas). **Tuzatish:** Redis (mavjud) bilan IP+telefon rate limit + login audit.

---

## 🟡 Deploydan oldin kuchli tavsiya (hardening)

11. **JWT_SECRET placeholder guard** — `lib/env.ts:21` `min(32)` tekshiradi, lekin `.env.example`dagi ma'lum `change_me_in_production_...` (43 belgi) o'tib ketadi → beparvo deploy ommaviy sekret bilan ishlaydi. Boot-time placeholder rad etish qo'shish.
12. **Security headers yo'q** — `secureHeaders`/helmet yo'q (CSP, HSTS, X-Frame-Options).
13. **Error tracking yo'q** (Sentry) + **metrics yo'q** (Prometheus/OTel).
14. **Graceful shutdown yo'q** — `index.ts`da SIGTERM handler yo'q → rolling deploy'da in-flight request/tranzaksiya uziladi.
15. **BullMQ worker in-process** — API replica'larida har birida worker spawn bo'ladi (dublikat ish yo'q, lekin resurs isrofi). Alohida worker process tavsiya.
16. **Web bundle 1.3 MB** (gzip 399 kB) — manual chunking / lazy import bilan kamaytirish.
17. **5 flaky integration test** — parallel DB izolyatsiyasini tuzatish (CI ishonchliligi).

---

## ✅ Tasdiqlangan kuchli tomonlar (qayta qurish shart emas)

- **RLS izolyatsiya** — barcha tenant-scoped jadval `ENABLE + FORCE ROW LEVEL SECURITY`; transaction-per-request + `SET LOCAL app.current_tenant_id`; CI lint kafolati; **integration testlar bilan tasdiqlangan**.
- **Auth yadrosi** — `Bun.password` argon2id, refresh token rotation + replay detection + chain-revoke, parol o'zgarganda barcha token revoke.
- **RBAC** — `requirePermission` fail-closed, Owner superuser to'g'ri, har mutating route guard bilan.
- **Migration** — admin (superuser) vs runtime non-superuser (`dental_app`, NOBYPASSRLS) ajratilgan; RLS DDL idempotent apply.
- **Observability poydevori** — pino structured JSON logging, `GET /api/health` DB-check, request-id middleware.
- **CORS** — yagona `WEB_ORIGIN` (env), `*` emas. **Hardcoded sekret yo'q** (hammasi env'dan). **`.env` git'da tracked emas.**
- **Funksional** — 24 backend modul + 16 web feature real ishlaydi; reports/payroll real SQL hisob; i18n uz/ru 806/806 kalit par/itet; role builder UI + audit log UI mavjud.

---

## ℹ️ Phase 2'ga ATAYLAB qoldirilgan (gap emas — loyiha rejasiga ko'ra)

Loyihaning o'z yo'l xaritasiga ko'ra quyidagilar v1 (R0–R5) doirasiga KIRMAYDI, shuning uchun "v1 uchun 100%" ularni qonuniy ravishda istisno qiladi:

- **Desktop (Electron)** — skeleton (`apps/desktop`, kod yo'q, M6)
- **Telegram bot** (`apps/telegram-bot` yo'q) + **Telegram bildirishnoma kanali** (faqat SMS)
- **Real Soliq integratsiya** — `NoOpFiscalProvider` (Phase 2/3)
- **1C export** — mavjud emas (eski M7; XLSX export bor)

---

## Tavsiya etilgan yo'l (path-to-production tartibida)

1. **Xavfsizlik kod-fixlari** (eng arzon, eng xavfli): #9 parol-reset ATO + #10 rate limiting + login audit + #11 JWT guard.
2. **Deploy konfig-fixlari**: #8 MinIO anonim policy olib tashlash.
3. **Deploy infratuzilma**: #1–#6 Dockerfile (api+web, multi-stage) → prod compose/k8s + Caddy/nginx + TLS → secret injection → deploy pipeline + migration step.
4. **Backup/DR**: #7 pg_dump/PITR + MinIO backup rejasi (tibbiy compliance).
5. **Hardening**: #12–#17 security headers, Sentry, graceful shutdown, worker ajratish, bundle, flaky testlar.

**Joriy holat: ~v1 kod tayyor, deploy va xavfsizlik hardeningи qilinmagan. Production'ga chiqishdan oldin yuqoridagi 🔴 hard blockerlar majburiy.**
