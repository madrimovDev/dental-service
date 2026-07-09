# Vendor-vositachiligidagi owner parol-tiklash (desktop, aktivatsiyaga o'xshash)

**Sana:** 2026-07-10
**Bog'liq:** CLI-226 (parol-reset OTP — desktop'da NoOp), CLI-475 (auth SMS desktop gap), CLI-348 (desktop activate flow), Supervisor license API (activate/heartbeat/reactivate)
**Maqsad:** Desktop'da klinika egasi (tenant owner) o'z parolini unutsa — SMS OTP (env yo'q, ishlamaydi) o'rniga vendor Supervisor admin panelidan bir martalik token beradi, mijoz uni desktop'ga kiritadi va O'ZI yangi parol o'rnatadi. DB va litsenziya (`.lic`) o'zgarmaydi — faqat owner `password_hash`.

## Qarorlar (brainstorm, 2026-07-10)

1. **Token mexanizmi:** online Supervisor verify (desktop → Supervisor `/verify-reset`). Internet SHART (offline emas — RSA offline token rad etildi soddalik uchun).
2. **Kimning paroli:** FAQAT tenant owner (superuser). Xodim parollari owner tomonidan mavjud user-management'da boshqariladi.
3. **Token format:** license-key kabi `XXXXX-XXXXX-XXXXX` (telefon orqali o'qib berish oson).
4. **Muddat:** 24 soat.
5. **Yangi parol:** mijoz desktop'da O'ZI kiritadi (token faqat ruxsat beradi; vendor parolni bilmaydi).

## 1. Supervisor — reset-token generatsiya + verify + consume

**Yangi jadval `license_reset_tokens`** (Supervisor DB, `apps/supervisor-api`):
```
id, license_id (FK → licenses), token_hash (SHA-256), fingerprint (text, ixtiyoriy bind),
expires_at (timestamp), consumed_at (timestamp null), created_by (admin id), created_at
```

**Admin panel** (`apps/supervisor-admin`, license detail sahifasi): "Parol-tiklash tokeni yaratish" tugmasi → `POST /v1/admin/licenses/:id/reset-token` (`adminJWT`, reactivate kabi). Server: `XXXXX-XXXXX-XXXXX` xom token generatsiya (crypto random, license-key generatoriga o'xshash), `token_hash = sha256(token)` saqlaydi, `expires_at = now + 24h`. Javob: xom token BIR MARTA qaytariladi (admin mijozga o'qib beradi) — DB'da faqat hash. Har yangi token oldingi consumedmagan tokenlarni bekor qiladi (bir license = bitta faol reset token).

**`POST /v1/license/verify-reset`** (public — desktop chaqiradi, `/activate`/`/heartbeat` yonida): `{ licenseKey, fingerprint, resetToken }`. Server:
- `licenseKey` → license topish; `token_hash = sha256(resetToken)` shu license uchun mos, `consumed_at IS NULL`, `expires_at > now`, `fingerprint` mos (agar bind qilingan bo'lsa).
- Valid → `consumed_at = now` (atomik, bir martalik) → `{ ok: true }`. Aks holda `{ ok: false }` / 400. Rate-limited.
- `license_events`'ga `'password_reset'` event yoziladi (audit).

## 2. Desktop API — owner parol-tiklash

**`POST /api/reset-owner-password`** (`apps/api`, public — license-middleware WHITELIST'ga qo'shiladi, `/api/activate` kabi; rate-limited): `{ resetToken, newPassword }`.

Oqim (`apps/api/src/routes/reset-owner-password.ts` yoki `auth` moduli):
1. `newPassword` validatsiya (mavjud parol siyosati — min uzunlik).
2. Desktop config/env'dan `licenseKey` + `fingerprint` olish (license-client mavjud helper).
3. Supervisor `POST /v1/license/verify-reset` (online, `license-client.ts` kengaytmasi) → `ok` bo'lmasa 400 `reset.invalid_token`.
4. `ok` → o'z DB'sida tenant + `owner_user_id` topish. **Desktop = bitta tenant** (birinchi/yagona tenant); `tenants.owner_user_id` → owner user.
5. Owner `password_hash` yangilash (bcrypt, `auth.service`'dagi hash helper). Boshqa HECH NARSA yozilmaydi.
6. `audit_log`: `action='owner_password_reset'`, `resource_type='user'`, `resource_id=owner_user_id` (parol EMAS).

**Muhim:** litsenziya `.lic` fayli, tenant, license — TEGILMAYDI. Faqat `users.password_hash` (owner).

## 3. Desktop UI — parol-tiklash sahifasi

- Web `apps/web` yangi public route `/reset-owner-password` (`/activate` kabi — login'dan oldin, `RequirePermission`siz). Forma: `resetToken` (XXXXX-XXXXX-XXXXX input) + `newPassword` + tasdiq (`zod4Resolver`) → `POST /api/reset-owner-password` → muvaffaqiyat toast → login sahifasiga redirect.
- Login sahifasi (`LoginPage`): "Parolni unutdingizmi? Xizmat ko'rsatuvchiga murojaat qiling" havolasi → `/reset-owner-password`.
- i18n uz/ru.

## Xavfsizlik

- Token bir martalik (`consumed_at` atomik), 24h muddat, rate-limited (activate naqshi — 10 urinish/15 daqiqa, IP+licenseKey bo'yicha).
- `fingerprint` **enforced bind EMAS** — admin token chiqarganda mijozning qurilma fingerprint'ini bilmaydi, shuning uchun `createResetToken` uni hech qachon o'rnatmaydi (token qatorida doim NULL). `verifyReset`dagi fingerprint-mos-kelish tekshiruvi kodda qoladi (kelajakda bind-on-issue oqimi qo'shilsa ishlaydi — hozircha no-op, chunki NULL har doim mos deb hisoblanadi) va tekshiruvda ishlatilgan `fingerprint` `license_events`'ning `'password_reset'` yozuviga **audit sifatida yoziladi** (qaysi qurilmadan tiklangani keyinroq tekshirilishi mumkin). Brute-force'ga qarshi haqiqiy himoya — token o'zi (bir martalik, 24h, hash-saqlangan) + yuqoridagi rate-limit, fingerprint EMAS.
- FAQAT tenant owner paroli — desktop owner'ni `tenants.owner_user_id`dan aniqlaydi, so'rovda user tanlanmaydi (spoofing yo'q).
- Vendor mijoz parolini BILMAYDI (mijoz o'zi kiritadi).
- Litsenziya/DB o'zgarmaydi (faqat owner password_hash).
- `verify-reset` public lekin token-gated + rate-limited; `reset-token` generatsiya `adminJWT` (faqat vendor).
- Online SHART — internet yo'q bo'lsa 503/aniq xato ("internet kerak").

## Testing

- Supervisor: reset-token generatsiya (hash saqlanadi, xom bir marta), verify-reset (valid → consume → ok; expired/consumed/wrong-fingerprint → fail), yangi token eski consumedmaganini bekor qiladi.
- Desktop API: verify ok → faqat owner password_hash o'zgaradi (litsenziya/boshqa users tegilmaydi — real DB assert); verify fail → 400, hech narsa o'zgarmaydi; injected supervisor-verify checker (network'siz).
- Web: reset sahifasi forma + submit + redirect.

## Rollout / bog'liqlik

- Supervisor migration (`license_reset_tokens`) + license-events enum kengaytma.
- Desktop `license-client.ts` `verifyReset(licenseKey, fingerprint, resetToken)` qo'shadi.
- CLI-226 OTP oqimi (email/telefon) o'zgarmaydi — bu desktop-only alohida yo'l (cloud SaaS'da OTP qoladi).
- CLI-475'dagi "auth SMS desktop" bilan bog'liq lekin alohida (bu owner-reset, u umumiy SMS).
