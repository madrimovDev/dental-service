# R4 Guruh C — Bildirishnomalar (Eskiz SMS + reminder + in-app bell): Design Spec (CLI-75)

- **Sana:** 2026-06-11
- **Epik:** R4 / Linear CLI-71 (M7) ning 3-guruhi (oxirgi) — **CLI-75**
- **Bog'liq:** CLAUDE.md §3.8 (NotificationChannel abstraksiya) + §3.7 (scaffold patterni), RFC-0008 (notifications), RFC-0009
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r4-group-c` (main'dan, Guruh B merge qilingach)

## Maqsad

Bildirishnoma infratuzilmasi: SMS kanal abstraksiyasi (NoOp default + Eskiz gated), in-app feed (topbar qo'ng'iroq), yozilish eslatmasi (BullMQ delayed job). Greenfield — `packages/notifications` bo'sh, BullMQ yo'q, notification jadval yo'q.

## Asosiy qarorlar (brainstorm)
- **SMS:** `NotificationChannel` interfeys + `NoOpChannel` (log, default) + `EskizChannel` (config-gated). Eskiz creds (`ESKIZ_EMAIL`/`ESKIZ_PASSWORD`) bo'lsa real, aks holda NoOp (fiskal §3.7 patterni).
- **Reminder:** BullMQ delayed job — yozilish yaratilganda `runAt = startTime − 24s` job; worker NotificationService chaqiradi.
- **In-app feed:** `notifications` jadval + topbar bell (o'qilgan/o'qilmagan).

## A. Kanal abstraksiya (`packages/notifications/src`)
- `types.ts`: `type NotificationMessage = { text: string }`; `interface NotificationChannel { send(to: string, message: NotificationMessage): Promise<{ ok: boolean; providerId?: string; error?: string }> }`.
- `noop.ts`: `createNoOpChannel(logger?)` → `send` log qiladi, `{ ok: true }`.
- `eskiz.ts`: `createEskizChannel(config: { email; password })` → Eskiz REST (token auth + `message/sms/send`). Xato → `{ ok: false, error }`.
- `index.ts`: `createSmsChannel(env: { eskizEmail?; eskizPassword? }): NotificationChannel` — creds bo'lsa Eskiz, aks holda NoOp. Eksport: tiplar + factory.
- `packages/notifications/package.json` — agar fetch'dan tashqari dep kerak bo'lmasa, qo'shimcha yo'q (Eskiz REST `fetch`).

## B. In-app feed (`notifications` jadval + modul)
- **Schema** `notifications`: `id, tenantId, userId FK, type text, title text, body text?, readAt timestamptz?, createdAt`. Index `(tenant_id, user_id, created_at)`. RLS (tenant-scoped).
- **Service** `notifications.service.ts` (factory `{ db, sms }`):
  - `notify(ctxOrTenant, { userId, type, title, body, smsTo? })` — `notifications` row insert + agar `smsTo` → `sms.send(smsTo, { text })`. **Ikki chaqiruv konteksti:** HTTP (`getDb(c)`) va worker (tenant tx). Shuning uchun `notify` `db`/tx ni parametr oladi (yoki ikki variant: `notifyInRequest(c, ...)` + `notifyInTx(tx, tenantId, ...)`).
  - `list(c, userId)`, `unreadCount(c, userId)`, `markRead(c, id)`, `markAllRead(c, userId)`.
- **Routes** `/api/notifications`: `GET /` (joriy user feed + `unreadCount`), `POST /:id/read`, `POST /read-all`. Faqat `authMiddleware` (har user o'z feed'i; `c.get('user').id`). RLS qo'shimcha himoya.

## C. BullMQ reminder
- **`bullmq` dependency** (`apps/api`). 
- `apps/api/src/lib/queue.ts`: `reminderQueue` (BullMQ `Queue`, Redis `REDIS_URL` connection). Job nomi `appointment-reminder`, payload `{ tenantId, appointmentId }`.
- **Sof helper** `apps/api/src/lib/reminder-delay.ts`: `reminderDelayMs(startTime: Date, now: Date, leadHours = 24): number | null` — `start − leadHours − now`; ≤0 yoki o'tgan → `null` (enqueue qilinmaydi). **Unit test.**
- **Hook:** `appointments.service` deps'ga `enqueueReminder?: (appointmentId: string, delayMs: number) => Promise<void>` (stock `deductStock` DI patterni). `createAppointment` insert'dan keyin: `const delay = reminderDelayMs(start, new Date()); if (delay != null) await deps.enqueueReminder?.(appt.id, delay);`. `appointments.routes` (yoki app.ts) `reminderQueue.add(..., { delay })` inject.
- **Worker** `apps/api/src/lib/reminder-worker.ts`: BullMQ `Worker('appointment-reminder')` — job → `withTenant(tenantId, async (tx) => { ... })` (tx ochib `SET LOCAL app.current_tenant_id`, RLS request'siz) → appointment + bemor telefonini o'qiydi → `notifications.service.notifyInTx(tx, tenantId, { userId: <doktor yoki bemor?>, type:'appointment_reminder', title, body, smsTo: bemorTelefon })`.
- **Boot:** `apps/api/src/index.ts` — `createApp` + serve yonida `startReminderWorker()` (in-process). **Hujjatlanadi:** production'da alohida worker process (v1 in-process).
- **Tenant context helper** `apps/api/src/db/scoped.ts` (yoki yangi): `withTenant(tenantId, fn)` — `db.transaction` + `SET LOCAL app.current_tenant_id` (auth.service'dagi mavjud pattern qayta ishlatiladi).

## D. Frontend bell
- `features/notifications/`: `useNotifications()`, `useUnreadCount()`, `useMarkRead()`, `useMarkAllRead()` → `api.notifications.*`. query-key `['notifications', ...]`, `refetchInterval` (masalan 60s) unread uchun.
- **Topbar 🔔** (`apps/web/src/shell/Topbar.tsx`): unread badge + dropdown (`Menu`/`Popover`) — ro'yxat (title/body/sana, o'qilmagan ajratilgan) + "hammasini o'qilgan". i18n `notifications.*`.

## env
`apps/api/src/lib/env.ts` ga: `ESKIZ_EMAIL: z.string().optional()`, `ESKIZ_PASSWORD: z.string().optional()` (ixtiyoriy — yo'q bo'lsa NoOp).

## Topologiya
```
Wave 1 (poydevor, 1 agent): notifications schema + RLS + migration; packages/notifications kanallar (types/noop/eskiz/factory); bullmq dep + queue.ts + reminder-delay helper(+test) + env ESKIZ_*
  ── barrier: migration apply ──
Wave 2 (backend ∥): notifications modul (service/routes + mount) ∥ appointments enqueueReminder hook + reminder-worker + index boot ∥ docs
  ── barrier: api-client ──
Wave 3 (frontend): topbar bell + feed
```
> appointments hook va worker bitta agent (ikkalasi reminderQueue + appointments'ga tegadi). notifications modul boshqa agent. app.ts/index.ts mount+boot — orkestrator (yoki worker-agent index.ts'ga tegadi, mount orkestrator).

## Test
- Sof `reminderDelayMs` unit (kelajak >24s → musbat; <24s → kichik/0; o'tgan → null).
- Integration (real DB): `notifications` insert + list/unread/markRead + RLS scope. (BullMQ job — real Redis integration og'ir → worker handler mantiqi `withTenant` + notify orqali, unit/manual; helper test asosiy.)
- typecheck + check:rls (1 yangi jadval → 28) + suite.

## Ochiq mayda nuqtalar (plan'da)
- Reminder kimga: bemorga SMS (telefon) + (ixtiyoriy) doktorga in-app? v1: bemorga SMS (smsTo=bemor telefon) + in-app yozuv bemorga bog'liq foydalanuvchi yo'q bo'lishi mumkin → in-app faqat staff uchun. Taklif: reminder in-app **doktorga** (userId=doctorId) + SMS **bemorga**. Plan'da qotiriladi.
- BullMQ Worker test muhitida ishga tushmasligi (REDIS yo'q test'da) — worker boot faqat non-test yoki guard bilan.
- Eskiz token cache (1 marta auth) — EskizChannel ichida; v1 har send'da yoki oddiy cache. Plan detali.
- `notify` ikki kontekst (request vs tx) — plan'da aniq imzo (`notifyInTx(tx, tenantId, payload)` worker uchun; `notify(c, payload)` HTTP uchun, ikkalasi umumiy insert mantiqini ulashadi).
