# CLI-478 — SMS OTP parol-reset oqimini olib tashlash

**Sana:** 2026-07-10
**Branch:** `cli-478-remove-sms-otp-reset`
**Holat:** Design tasdiqlangan

> ⚠️ Ticket qayta yo'naltirildi. Asl CLI-478 "auth OTP SMS'ni per-tenant messaging'ga
> ko'chirish" edi. Foydalanuvchi qarori (2026-07-10): ko'chirish emas — **self-service
> SMS OTP parol-reset oqimini butunlay olib tashlash**. Sabab: ikkala foydalanuvchi turi
> allaqachon boshqa yo'l bilan qoplangan.

---

## 1. Maqsad va asos

Self-service SMS OTP parol-reset oqimini butunlay o'chirish. Bu oqim ortiqcha, chunki
parolni tiklashning ikkala holati allaqachon mavjud va ishlaydi:

| Foydalanuvchi | Parolni tiklash yo'li | Holat |
|---|---|---|
| **Owner** | Supervisor vendor-token reset (`/reset-owner-password`, CLI-226) | ✅ Bor |
| **Xodim** | Owner `UsersSettingsScreen`'dan temp-password reset (`POST /users/{id}/reset-password`, `password_reset_by_admin` audit) | ✅ Bor (backend+client+UI) |

Qo'shimcha sabab (asl ticket): `auth.service.ts` OTP SMS kanali build-vaqti global
`env.ESKIZ_*`'dan quriladi. Desktop'da env yo'q → OTP SMS = NoOp → foydalanuvchi kod
ololmaydi. Per-tenantga ko'chirish esa konseptual jihatdan mos kelmaydi (parol
platform-level, tenant konteksti yo'q — CLAUDE.md §3.1). Oqimni olib tashlash bu
ziddiyatni ildizidan hal qiladi.

**Foydalanuvchiga ko'rinadigan yagona o'zgarish:** login sahifasida "Parolni
unutdingizmi?" (`/forgot-password`) linki yo'qoladi. "Owner parolini tiklash"
(`/reset-owner-password`, Supervisor) linki qoladi. Xodim parolni unutsa — owneriga
o'zi murojaat qiladi (jonli/telefon), owner UI'dan reset qiladi.

---

## 2. Olib tashlanadigan qism (faqat SMS OTP oqimi)

### Backend (`apps/api`)

1. **`modules/auth/auth.service.ts`**
   - `requestPasswordReset` + `resetPassword` funksiyalar (va `AuthService` return'idan olib tashlash)
   - `sms` dep (`AuthServiceDeps.sms`), `const sms = deps.sms ?? createSmsChannel(...)` bloki
   - `createSmsChannel` / `NotificationChannel` (`@dental/notifications`) import
   - `passwordResetTokens` (`@dental/db-schema`) import
   - Endi ishlatilmaydigan yordamchi import'lar (`gt`, `desc` va h.k. — faqat qolgan kodga qarab tozalanadi)

2. **`modules/auth/auth.routes.ts`**
   - `POST /password-reset-request` route (`passwordResetRequestRoute` + handler)
   - `POST /password-reset` route (`passwordResetRoute` + handler)
   - `resetRequestRateLimit` + `resetRateLimit` rate-limiter'lar
   - Tegishli schema import'lar

3. **`modules/auth/auth.schema.ts`**
   - `passwordResetRequestSchema`, `passwordResetSchema`
   - `passwordResetRequestResponseSchema`, `passwordResetResponseSchema`
   - Tegishli `type` eksport'lar (`PasswordResetInput`, `PasswordResetRequestInput`)

4. **`lib/env-schema.ts`**
   - `ESKIZ_EMAIL` + `ESKIZ_PASSWORD` (endi hech qayerda ishlatilmaydi — tasdiqlangan)

5. **`packages/notifications`**
   - `createSmsChannel` env-wrapper eksporti (consumer'siz qoladi).
   - ⚠️ Per-tenant `createEskizChannel` **saqlanadi** (recall/reminder worker ishlatadi).
     Faqat env-wrapper `createSmsChannel` o'chiriladi.

6. **DB — `password_reset_tokens` jadvali**
   - Drop qiluvchi yangi Drizzle migration (`drizzle-kit generate` → review → commit)
   - `packages/db-schema/src/tables/password-reset-tokens.ts` fayli o'chirish
   - `packages/db-schema/src/index.ts` va boshqa barrel/re-export reference'lari
   - ⚠️ **Qaytmas** — pastdagi §5 riskga qarang

### Web (`apps/web`)

7. **Sahifalar o'chirish**
   - `features/auth/pages/forgot-password.page.tsx`
   - `features/auth/pages/reset-password.page.tsx`
   - Tegishli test fayllari (agar bo'lsa)

8. **`features/auth/pages/login.page.tsx`**
   - `/forgot-password` link (`<Anchor to="/forgot-password">`, ~88-89 qatorlar) olib tashlash
   - `/reset-owner-password` link **qoladi**

9. **`features/auth/auth.api.ts`**
   - `useResetRequest` + `useReset` hooks
   - `passwordResetRequest` / `passwordReset` api-client import'lari

10. **`features/auth/auth.routes.tsx`**
    - `/forgot-password` va `/reset-password` route registratsiyasi + lazy import'lar

11. **Testlar**
    - `login.page.test.tsx` — `/forgot-password` link kutgan assertion'larni tozalash
    - Boshqa reset-oqim testlarini o'chirish

### OpenAPI

12. `bun run generate:openapi` + `bun run generate:api-client`
    - Reset endpoint'lar client'dan avtomatik chiqadi (`passwordResetRequest`,
      `passwordReset` operatsiyalari)

---

## 3. Saqlanadi (tegilmaydi)

- `/reset-owner-password` sahifa + `POST /api/reset-owner-password` desktop route (Supervisor, CLI-226)
- `POST /users/{id}/reset-password` + `UsersSettingsScreen` reset UI (owner → xodim)
- `POST /change-password` (autentifikatsiyalangan foydalanuvchi o'z parolini o'zgartirishi)
- Per-tenant `resolveTenantChannel` / `createEskizChannel` / `createTelegramChannel` (recall/reminder)

---

## 4. Verifikatsiya

- `bun run typecheck --force` — toza (o'lik import/eksport qolmaganini isbotlaydi; harness
  new-diagnostics ba'zan STALE — `--force` obro'li)
- `bun run check:rls` — jadval drop RLS coverage'ni buzmaganini (drop qilingan jadval
  endi ro'yxatda kutilmasligi kerak)
- api testlar yashil — o'chirilgan reset testlar minus, qolganlar pass
- web testlar yashil — `login.page.test.tsx` yangilangan
- Login sahifa qo'lda/`verify` bilan: faqat "Owner parolini tiklash" linki ko'rinadi,
  "Parolni unutdingizmi?" yo'q
- `biome check` — 0 xato

---

## 5. Migratsiya risk eslatmasi

`password_reset_tokens` drop **qaytmas** operatsiya. Xavfsiz, chunki:
- Pre-launch: jonli tenant yo'q, main lokal (push'siz sessiyalar)
- Jadvalda saqlanadigan token'lar 30 daqiqada muddati tugaydigan bir martalik OTP —
  hech qanday tarixiy qiymati yo'q
- Boshqa hech qanday kod jadvalga murojaat qilmaydi (§2.6 grep bilan tasdiqlangan)

---

## 6. Scope tashqarisi

- Cloud multi-tenant self-service reset (telefon → tenant aniqlash) — **YAGNI**, jonli
  cloud tenant yo'q, kerak bo'lganda alohida ticket
- `password_reset_by_admin` audit yoki owner-reset oqimlarini o'zgartirish — ular ishlaydi
- Har qanday yangi UI qurish — xodim admin-reset UI allaqachon to'liq
