# P bosqichi 1 — Ma'lumot yaxlitligi (P1, P4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Ijro qoidalari: `docs/ORCHESTRATION-GUIDE.md`.

**Goal:** Tenant so'rovi xato bilan tugasa tranzaksiya rollback qilinadi (P1), Redis/BullMQ eslatma side-effect'lari faqat commit'dan keyin va best-effort ishlaydi (P4).

**Architecture:** `rlsMiddleware` `await next()` dan keyin `c.error` yoki status ≥ 500 ni tekshirib, ichki sentinel bilan tranzaksiyani bekor qiladi va tayyor javobni saqlaydi. Shu middleware har so'rovga `afterCommit` ro'yxatini beradi; servislar side-effect'ni `onAfterCommit(c, fn)` orqali ro'yxatga qo'yadi, middleware ularni commit muvaffaqiyatli bo'lgandan keyin try/catch bilan bajaradi. Reminder enqueue/remove mantig'i `app.ts` closure'idan alohida testlanadigan `createReminderScheduler(queue)` factory'siga ko'chadi.

**Tech Stack:** Bun, Hono, Drizzle (Postgres RLS), BullMQ 5.x, bun:test.

**Spec:** `docs/superpowers/specs/2026-11-11-completion-roadmap-design.md` §3.1 (+ `docs/FEATURE-RESEARCH-2026-11-11.md` P1, P4).

## Global Constraints

- Rollback qoidasi (roadmap §3.1, 🛠): **`c.error` o'rnatilgan (har qanday throw, shu jumladan `HTTPException`/`ZodError`) YOKI `c.res.status >= 500` → rollback.** `fail()` bilan *qaytarilgan* 4xx → **commit** (qasddan).
- Klientga boradigan javob o'zgarmaydi (status va body `errorHandler` qaytarganidek qoladi) — rollback sentinel klientga oqib chiqmaydi.
- Side-effect'lar: rollback bo'lsa **umuman bajarilmaydi**; commit bo'lsa ketma-ket, har biri o'z try/catch'ida, xato `logger.warn({ err, requestId }, 'afterCommit side-effect failed')` bilan loglanadi va javobni o'zgartirmaydi.
- `afterCommit` ro'yxati yo'q kontekstda (tenant'siz so'rov, test fake-context, worker) `onAfterCommit` fn'ni **darhol** chaqiradi (await, try/catch + log) — mavjud spy-dep testlar o'zgarmasdan ishlaydi.
- Outbox jadvali qurilmaydi (roadmap 🛠).
- Testlar faqat lane bazasiga qarshi (`DATABASE_URL`/`DATABASE_ADMIN_URL`/`REDIS_URL` controller beradi); argumentsiz `bun test` yo'q.
- Barcha yangi kod izohlari loyiha uslubida (o'zbekcha, qisqa).

## Review Focus

1. **Handler `c.json(..., 500)` qaytaradi (throw qilmaydi)** — `c.error` yo'q, lekin rollback kerak → Task 1 testi `returns 500 without throwing → rolled back`.
2. **Handler `HTTPException(400)` throw qiladi** — 4xx, lekin throw → rollback → Task 1 testi `thrown HTTPException 400 → rolled back`.
3. **Handler `fail()` bilan 409 qaytaradi** (masalan strike/audit yozib) → commit saqlanadi → Task 1 testi `returned 409 → committed`.
4. **Redis o'chiq / `enqueueReminder` throw qiladi** — so'rov 200, DB o'zgarishi saqlanadi → Task 2 testi `side-effect throws → 200 and row committed`.
5. **Bekor qilingan yozilish qayta faollashtiriladi (status-only, `cancelled→scheduled`)** — eslatma qayta qo'yiladi → Task 3 testi.

---

### Task 1: P1 — `rlsMiddleware` xato/5xx'da rollback

**Tier:** T3 — `sonnet` · `high` · lane `L1` · risky (verifier).

**Files:**
- Modify: `apps/api/src/middleware/rls.ts`
- Test: `apps/api/tests/integration/p1-rls-rollback.test.ts` (yangi)

**Interfaces:**
- Produces: `rlsMiddleware(db)` — imzo o'zgarmaydi. Task 2 shu faylga `afterCommit` qo'shadi.

- [ ] **Step 1: Failing test yozish.** Real DB. Mini `Hono` app: (a) `c.set('activeTenantId', tenantId)` va `c.set('user', {id})` qo'yadigan fake-auth middleware, (b) `rlsMiddleware(db)`, (c) `app.onError(errorHandler)` (`src/middleware/error-handler.ts`). Har route `getDb(c)` orqali `patients` jadvaliga unikal `fullName` bilan qator yozadi, keyin:
  - `/throw` — `throw new Error('boom')` → expect status 500, qator **yo'q**;
  - `/return500` — `return c.json(fail('x','x'), 500)` → 500, qator **yo'q**;
  - `/http400` — `throw new HTTPException(400, {message:'bad'})` → 400, qator **yo'q**;
  - `/fail409` — `return c.json(fail('conflict','c'), 409)` → 409, qator **bor**;
  - `/ok` — `return c.json(ok({}), 200)` → 200, qator **bor**.
  Qator borligini RLS kontekstida (`SET LOCAL app.current_tenant_id`) yoki `DATABASE_ADMIN_URL` ulanishi orqali tekshiring. Fixture: tenant+owner `cli-186-187-appointments.test.ts` naqshida (`TRUNCATE users, tenants … CASCADE` before/after).
- [ ] **Step 2: Yiqilishini tekshirish.** Run: `cd apps/api && bun test --env-file=../../.env --timeout 30000 tests/integration/p1-rls-rollback.test.ts` (lane env bilan). Expected: `/throw`, `/return500`, `/http400` FAIL (qator bor).
- [ ] **Step 3: Implementatsiya.** `rls.ts` tranzaksiya ichida `await next()` dan keyin: `if (c.error || c.res.status >= 500) throw ROLLBACK` (modul-ichki `const ROLLBACK = Symbol('rls-rollback')` yoki xususiy Error klassi). Tranzaksiyani `try/catch` bilan o'rang: ushlangan xato `ROLLBACK` bo'lsa jim qaytish (javob allaqachon `c.res`da), boshqa xatoni avvalgidek qayta throw. Mavjud `nextError` yo'li saqlanadi (onError ulanmagan sub-app holati).
- [ ] **Step 4: O'tishini tekshirish.** Step 2 buyrug'i + `tests/integration/rls.test.ts`. Expected: hammasi PASS.
- [ ] **Step 5: Typecheck.** `cd apps/api && bunx tsc --noEmit -p .` → exit 0.
- [ ] **Step 6: Commit.** `fix(api): rlsMiddleware xato va 5xx javobda tranzaksiyani rollback qiladi (P1)`.

### Task 2: P4 — `afterCommit` + reminder scheduler

**Tier:** T3 — `sonnet` · `high` · lane `L1` (Task 1 dan keyin, xuddi shu branch) · risky (verifier).

**Files:**
- Create: `apps/api/src/db/after-commit.ts`
- Create: `apps/api/src/lib/reminder-scheduler.ts`
- Modify: `apps/api/src/middleware/rls.ts`, `apps/api/src/lib/audit-logger.ts` (ContextVariableMap'ga `afterCommit?: AfterCommitFn[]`), `apps/api/src/app.ts:209-245` (closure → `createReminderScheduler(reminderQueue)`), `apps/api/src/modules/appointments/appointments.service.ts:331,510,513,524`
- Test: `apps/api/tests/integration/p4-reminder-after-commit.test.ts` (yangi, **real Redis + real BullMQ `Queue`**)

**Interfaces:**
- Consumes: Task 1 dagi `rlsMiddleware` rollback xulqi.
- Produces:
  - `type AfterCommitFn = () => Promise<void>`
  - `onAfterCommit(c: Context, fn: AfterCommitFn): Promise<void>` — ro'yxat bo'lsa push qilib darhol resolve; bo'lmasa fn'ni hozir await qiladi (try/catch + `logger.warn`).
  - `runAfterCommit(fns: AfterCommitFn[], requestId?: string): Promise<void>` — ketma-ket, har biri try/catch + warn.
  - `createReminderScheduler(queue: Queue): { enqueueReminder(tenantId: string, appointmentId: string, delayMs: number): Promise<void>; removeReminder(appointmentId: string): Promise<void> }` — `app.ts`dagi mavjud mantiq (getJob → changeDelay, aks holda `add` `removeOnComplete: true, removeOnFail: 100`; remove — getJob → remove, xatoni yutadi) **o'zgarishsiz** ko'chiriladi.

- [ ] **Step 1: Failing test yozish.** Real `Queue('reminders-p4-test', { connection: { url: process.env.REDIS_URL } })`, `scheduler = createReminderScheduler(queue)`. Mini app (Task 1 naqshi: fake-auth → `rlsMiddleware` → `onError`). Route'lar `patients`ga qator yozib, `await onAfterCommit(c, () => scheduler.enqueueReminder(tenantId, <uuid>, 60_000))` chaqiradi, keyin:
  - `commit enqueues after commit`: 200 qaytaradi → `await queue.getJob(reminderJobId(uuid))` **mavjud**, qator bor;
  - `rollback skips side-effect`: keyin `throw new Error('boom')` → 500, job **yo'q**, qator yo'q;
  - `side-effect throws → 200 and row committed`: `onAfterCommit(c, async () => { throw new Error('redis down') })` → 200, qator bor;
  - `removeReminder after commit`: avval job qo'yib, route `onAfterCommit(c, () => scheduler.removeReminder(uuid))` → 200 dan keyin job yo'q.
  `afterAll`: `queue.obliterate({ force: true })`, `queue.close()`.
- [ ] **Step 2: Yiqilishini tekshirish.** `bun test … tests/integration/p4-reminder-after-commit.test.ts` → import xatosi (`after-commit.ts` yo'q) FAIL.
- [ ] **Step 3: `after-commit.ts` va `reminder-scheduler.ts` ni yozish;** `rls.ts`da tenant yo'lida `c.set('afterCommit', [])` (tranzaksiya ichida, `next()` dan oldin), tranzaksiya **muvaffaqiyatli resolve** bo'lgandan keyin `await runAfterCommit(fns, c.get('requestId'))`. Rollback (`ROLLBACK` yoki boshqa xato) bo'lsa chaqirilmaydi. Tenant'siz yo'lda ro'yxat o'rnatilmaydi (onAfterCommit darhol ishlaydi).
- [ ] **Step 4: Ulash.** `app.ts` closure → `const reminderScheduler = createReminderScheduler(reminderQueue)`; `enqueueReminder: reminderScheduler.enqueueReminder, removeReminder: reminderScheduler.removeReminder`. `appointments.service.ts` 4 joyda `await deps.X?.(…)` → `if (deps.X) await onAfterCommit(c, () => deps.X!(…))` (dep yo'q bo'lsa no-op saqlanadi).
- [ ] **Step 5: O'tishini tekshirish.** `tests/integration/p4-reminder-after-commit.test.ts`, `tests/integration/p1-rls-rollback.test.ts`, `tests/integration/cli-186-187-appointments.test.ts`, `tests/integration/cli-379-reminder-channel.test.ts`, `tests/integration/reminder-no-phone.test.ts`, `src/lib/reminder-job-id.test.ts` → PASS.
- [ ] **Step 6: Typecheck** (Task 1 Step 5). **Commit:** `fix(api): eslatma side-effect'lari commit'dan keyin, best-effort (P4)`.

### Task 3: P4 — status-only qayta faollashtirishda eslatma qayta qo'yiladi

**Tier:** T2 — `sonnet` · `medium` · lane `L1` (Task 2 dan keyin).

**Files:**
- Modify: `apps/api/src/modules/appointments/appointments.service.ts` (~504-525, `update` ichidagi reminder bloki)
- Test: `apps/api/tests/integration/cli-186-187-appointments.test.ts` (yangi `describe` qo'shiladi)

**Interfaces:**
- Consumes: Task 2 `onAfterCommit`; `isActiveStatus`, `reminderDelayMs` (mavjud).

- [ ] **Step 1: Failing test.** Shu fayldagi spy-dep naqshi (fake-context → `onAfterCommit` darhol ishlaydi). Seed: `seedAppt(…, 'cancelled')` kelajakdagi sanada (≥ 2 kun keyin, `reminderDelayMs` non-null bo'lsin); filialga `workHours` (Du–Sha 09:00–18:00) qo'ying — re-validatsiya `outside_working_hours` bermasin. `update(c, id, { status: 'scheduled' })` → `ok: true` va `enqueueReminder` spy **bir marta** `(tenantId, id, delay>0)` bilan chaqirilgan. Ikkinchi holat: `no_show → scheduled` — xuddi shunday.
- [ ] **Step 2: Yiqilishini tekshirish** — spy chaqirilmagan → FAIL.
- [ ] **Step 3: Implementatsiya.** `update` reminder blokida yangi tarmoq: `startTime` yo'q, `before.status` ∈ {`cancelled`,`no_show`} va `isActiveStatus(updated.status)` → `reminderDelayMs(new Date(updated.startTime), new Date())` non-null bo'lsa `onAfterCommit(c, () => deps.enqueueReminder!(tenantId, id, delay))`.
- [ ] **Step 4: O'tishini tekshirish.** `tests/integration/cli-186-187-appointments.test.ts` → PASS.
- [ ] **Step 5: Typecheck + commit:** `fix(api): qayta faollashtirilgan yozilishga eslatma qayta qo'yiladi (P4)`.

---

## Ijro (orkestratsiya)

- **Bitta lane (`L1`), ketma-ket** — uchala vazifa `rls.ts` va `appointments.service.ts`ga tegadi; parallel lane yo'q.
- Controller tayyorlaydi: worktree `.claude/worktrees/p1-l1` (`wf/p-stage1-l1`), `.env` nusxasi, `dental_test_p1_l1` bazasi + migratsiya, `REDIS_URL=…/1`.
- Har vazifa: `implementer` (tier bo'yicha) → `test-runner` (haiku/low, shu vazifaning nomlangan testlari) → `reviewer` (sonnet/medium) → Task 1–2: `verifier` (opus/high, RLS/tranzaksiya).
- Merge gate (bir marta): `turbo typecheck`, `biome`, `check:rls`, to'liq API to'plami (ma'lum 9 yiqilishga qarshi) → whole-branch review (controller) → merge `--no-ff` + push → reestr/CLAUDE.md da P1, P4 ✅.
