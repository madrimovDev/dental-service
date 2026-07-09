# Per-tenant Telegram + Eskiz kredensiallari (desktop-configurable)

**Sana:** 2026-07-09
**Bog'liq ticketlar:** CLI-379 (Telegram bot + account-linking), CLI-400 (Eskiz SMS credential)
**Maqsad:** Telegram bot token va Eskiz SMS kredensiallarini har tenant O'ZI (desktop/web sozlamalar orqali) kiritadigan qilish — build-vaqti `env` o'rniga runtime DB. Desktop ilovada har mijozning o'z bazasi bo'lgani uchun global env noto'g'ri. Telegram outbound to'liq ishlashi uchun bemor account-linking (contact-share) ham kiradi.

## Qarorlar (brainstorm, 2026-07-09)

1. **Qamrov:** credential sozlash + Telegram bemor-linking (to'liq outbound). Eskiz SMS credential yetarli bo'lishi bilan darhol ishlaydi.
2. **Maxfiylik:** token/parol DB'da AES-256 shifrlangan; GET javobda hech qachon xom qaytmaydi — `configured` bayrog'i + oxirgi 4 belgi hint.
3. **Linking:** Telegram `request_contact` (contact-share) — bemor tugma bosadi, Telegram tasdiqlangan telefonni yuboradi, bot shu telefon bo'yicha (tenant ichida) patient topib `telegram_chat_id` saqlaydi.
4. **Bot jarayoni:** API worker ichida in-process bot-manager (per-tenant Telegraf long-poll). Desktop=1, cloud=N. Yangi process yo'q.
5. **Eskiz cred:** email + parol (mavjud `createEskizChannel` — login→token avtomatik).
6. **Reload:** Redis (Valkey) pub/sub — settings PUT → `telegram:reload:<tenantId>` publish → bot-manager stop+start.

## 1. Ma'lumot modeli

**`tenant_settings.integration_settings`** (mavjud `jsonb Record<string, unknown>` — migration SHART EMAS, faqat mapper/schema tiplashtiriladi):
```
{
  telegram: { botTokenEnc: string, botUsername?: string } | null,
  sms:      { eskizEmailEnc: string, eskizPasswordEnc: string } | null
}
```
- `*Enc` — AES-256-GCM shifrlangan (kalit: `getOrCreateMessagingSecret()` — desktop `jwt-secret.txt`/`getOrCreateJwtSecret` naqshi, `dataDir`da fayl; cloud env `MESSAGING_SECRET`). Yangi `apps/api/src/lib/crypto.ts` — `encryptSecret(plain)`/`decryptSecret(enc)`.
- `botUsername` — `getMe`'dan (contact-share deep-link/ko'rsatish uchun).

**`patients.telegram_chat_id`** — yangi `text` ustun (migration 0039 + hech qanday RLS o'zgarishi yo'q, patients allaqachon RLS'da). Nullable. Contact-share linking natijasi. Index shart emas (worker patient-row bilan birga o'qiydi).

## 2. Backend — tenant-settings integrations

- **`PUT /tenant-settings`** (mavjud, `tenant_settings.edit` guard) — `updateSettingsSchema`'ga qo'shiladi: `telegram?: { botToken: string | null }`, `sms?: { eskizEmail, eskizPassword } | null`. Xom qiymatlar; service AES bilan shifrlab `integration_settings`'ga yozadi (null → tozalash). `null` botToken → integration o'chiriladi + Redis reload publish.
- **`GET /tenant-settings`** javobi — mapper hech qachon xom qaytармaйди: `integrationSettings: { telegram: { configured, hint }, sms: { configured, hint } }`. `hint` = `"••••" + last4` (decrypt qilib oxirgi 4 belgi).
- **`POST /tenant-settings/integrations/test`** (yangi route, `tenant_settings.edit`) — body `{ target: 'telegram' | 'sms', ... xom cred yoki saqlangan }`. Telegram: `getMe` (valid token + username qaytaradi). Eskiz: `auth/login` (200 = valid). Javob `{ ok: boolean, detail?: string }`. Token'ni saqlashdan OLDIN "Tekshir" tugmasi shuni chaqiradi.

## 3. Bot-manager (API worker in-process)

Yangi `apps/api/src/lib/telegram-bot-manager.ts`:
- `startTelegramBotManager(deps: { adminDb, withTenant, redisSub })` — `worker.ts`da recall/reminder worker yonida boot.
- Boot: `adminDb`'dan `integration_settings.telegram.botTokenEnc IS NOT NULL` tenantlarni o'qiydi → har biri uchun `launchBot(tenantId, token)`.
- `launchBot`: `new Telegraf(decrypt(token))`, handlerlar:
  - `bot.start` → `reply(request_contact keyboard)` ("Telefoningizni ulashing").
  - `bot.on('contact')` → `withTenant(tenantId)`: `patients WHERE phone = contact.phone_number` (normalizatsiya) → topilsa `telegram_chat_id = ctx.chat.id` yangilaydi + tasdiq reply; topilmasa "klinikaga murojaat qiling".
  - `bot.launch()` (long-poll). `Map<tenantId, Telegraf>` da saqlanadi.
- **Reload:** `redisSub.subscribe('telegram:reload')` → message `<tenantId>` → `stopBot(tenantId)` (agar bor) + DB'dan yangi token o'qib `launchBot` (token bo'lsa). Graceful `bot.stop()`.
- Mavjud `apps/telegram-bot` skeleton logikasi shu managerga ko'chadi; `apps/telegram-bot` app deprecated/o'chiriladi (yoki thin wrapper). **Qaror: ko'chiriladi, apps/telegram-bot o'chiriladi** (bir kod, desktop+cloud).

## 4. Worker per-tenant kanal (recall + reminder)

- `recall-worker.ts` va `reminder-worker.ts`: hozir `createNotificationChannel(env)` bir marta (global). Endi `withTenant(row.tenantId)` ichida tenant `integration_settings`'ni o'qib (decrypt), **per-tenant channel** yaratadi:
  - Priority: bemor `telegram_chat_id` bor VA tenant telegram configured → **Telegram** (chat_id'ga). Aks holda tenant Eskiz configured → **Eskiz SMS** (telefon). Aks holda **NoOp** (log).
- `createNotificationChannel` chaqiruvi env o'rniga tenant cred bilan. Kichik helper `resolveTenantChannel(settings, chatId)`.
- Bemor `telegram_chat_id` — worker'ning mavjud due/patient query'siga qo'shiladi (L8 emergency fallback qatoriga o'xshab).

## 5. Desktop/web settings UI

- Web `apps/web/src/features/settings` (yoki mavjud `/settings/integrations`) — Integrations kartasi:
  - Telegram: `[bot token]` input + `[Tekshir]` (test route) + `configured` badge + hint. Saqlash → PUT.
  - Eskiz: `[email]` + `[parol]` + `[Tekshir]` + badge + hint.
- Desktop mavjud web'ni wrap qiladi (yangi desktop kod yo'q — `/settings/integrations` allaqachon desktop tray'dan ochiladi).
- i18n uz/ru.

## Xavfsizlik

- Token/parol hech qachon GET javobda xom emas (mask). AES-256-GCM at-rest. Kalit desktop `dataDir` fayl (600) / cloud env.
- `tenant_settings.edit` faqat Tenant Admin/Owner (mavjud). RLS integration_settings'ni tenant izolyatsiya qiladi.
- Contact-share: telefon Telegram tomonidan tasdiqlanadi (soxta emas); linking tenant ichida (bot per-tenant token).
- Audit: integration credential o'zgarishi `audit_log`'ga (mavjud tenant-settings update audit — token qiymati EMAS, faqat "changed").

## Testing

- `crypto.ts` unit: encrypt→decrypt round-trip, wrong-key fail.
- tenant-settings mapper: integration mask (xom emas, hint to'g'ri).
- Bot-manager unit: contact handler → patient match → chat_id (mock Telegraf ctx + fake DB); reload → stop+start.
- Worker per-tenant: telegram_chat_id bor+telegram configured → Telegram; yo'q → Eskiz; hech biri → NoOp (integration test, real DB 5433).
- Test route: getMe/login mock.

## Migration/rollout

- 0039 `patients.telegram_chat_id`.
- `integration_settings` shape — mavjud jsonb, migration yo'q.
- Backward: mavjud `TELEGRAM_BOT_TOKEN`/`ESKIZ_*` env DEPRECATED (worker endi DB'dan). Env fallback saqlanmaydi (per-tenant yagona manba) — yoki desktop single-tenant uchun env→DB migratsiya (birinchi-run). **Qaror: env butunlay olib tashlanadi, faqat DB.**
- CLI-379 va CLI-400 shu ish bilan yopiladi.
