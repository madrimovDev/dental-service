# Treatment-flow Audit (CLI-479…489) — 1-Workflow Orkestratsiya Implementatsiya Rejasi

> **For agentic workers:** Bu reja **`Workflow` tool** orqali ijro etiladi (foydalanuvchi aniq so'ragan). Ijro modeli: parallel implement (4 lane, worktree-izolyatsiya) → serial adversarial verify → koordinator sekvensial integratsiya. Standart `subagent-driven-development`/`executing-plans` EMAS — pastdagi §Ijro'ga qarang. Har lane implementer'i o'z tasklarini TDD bilan bajaradi.

**Goal:** 2026-07-10 davolash-oqimi audit'ining 11 kod-ticketini (CLI-479…489) bitta Workflow orkestratsiyasida, izolyatsiyalangan parallel subagentlar bilan hal qilish; har fix mustaqil adversarial verify'dan o'tadi.

**Architecture:** 11 task fayl-lokalligiga ko'ra 4 parallel lane'ga guruhlanadi; har lane alohida git worktree'da. Implement parallel (DB'siz — faqat kod+typecheck), verify serial (yagona test-DB kontensiyasi sababli), merge+whole-branch review Workflow tashqarisida koordinator tomonidan. Recall bog'lanishi DI-hook orqali (call-only) → lane'lar shared faylni tahrirlamaydi.

**Tech Stack:** Bun + Hono + Drizzle + Zod + Vitest/`bun test`; PostgreSQL 16 (RLS); Biome; `@hono/zod-openapi`.

## Global Constraints

- **DB access:** har query `getDb(c)` (RLS-bound transaction) orqali; explicit `WHERE tenant_id` YOZILMAYDI (RLS filtrlaydi). Cross-tenant guard'lar (CLI-484/485): helper `apps/api/src/lib/ownership.ts`da, `deps.ownership.assertPatientExists(c, id)` / `.assertUserExists(c, id)` DI orqali chaqiriladi (agar modulga `ownership` inject qilinmagan bo'lsa — inject qilish fix qismidir).
- **DI:** factory funksiyalar; recall/tooth-chart bog'lanishi `deps.<hook>?.<method>` orqali (to'g'ridan import EMAS).
- **Audit:** har permission-protected mutatsiya `audit_log`ga yoziladi (before/after).
- **Migrations:** `bun --filter @dental/api db:generate` (drizzle-kit) → review → commit. Faqat **L3** migration chiqaradi.
- **Money serialization:** pul qatorlari `numeric(14,2)`; refund netting/adjustment signed-arifmetika (CLI-479 seam).
- **Verify komandalar:**
  - Typecheck: `bun --filter @dental/api typecheck` (= `tsc --noEmit`, DB kerak emas)
  - Lint: `bun run lint` (= `biome check .`)
  - Integration test: `cd apps/api && bun test --env-file=../../.env tests/integration/<file>`
  - RLS: `bun run check:rls`
- **Til:** UI/xabarlar i18n (`t()`); DB kontent `name_uz`/`name_ru`. (Bu round backend-og'ir; i18n faqat yangi xato-xabar bo'lsa.)
- **Push YO'Q:** barcha merge lokal `main`ga `--no-ff`; push faqat foydalanuvchi alohida ruxsat bergach.

---

## File Structure (lane bo'yicha)

**L1 — Payroll (CLI-479)**
- Modify: `apps/api/src/modules/cashier/cashier.service.ts` (refund yo'li)
- Modify: `apps/api/src/modules/payroll/payroll.service.ts` (revenue-query netting / adjustment absorption)
- Modify/Test: `apps/api/tests/integration/cli-446-payroll-adjustments.test.ts` + yangi regressiya test

**L2 — Queue↔Appointments (CLI-480, 482, 483, 486)**
- Modify: `apps/api/src/modules/appointments/appointments.transitions.ts` (matritsa)
- Modify: `apps/api/src/modules/appointments/appointments.service.ts` (reverse-sync hook, reactivation recall)
- Modify: `apps/api/src/modules/queue/queue.service.ts` (sweep, missed→no_show)
- Modify: `apps/api/src/app.ts` (agar reverse-sync wiring kerak bo'lsa)
- Test: `apps/api/tests/integration/` (yangi test fayl(lar))

**L3 — Treatment-stage (CLI-481, 487, 488)**
- Modify: `apps/api/src/modules/clinical/visit-notes/visit-notes.service.ts` (re-point revert)
- Modify: `apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts` (completion path: lab-gate + tooth auto-update)
- Modify: `apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts` (agar revert kerak bo'lsa)
- Modify: `apps/api/src/modules/clinical/tooth-charts/tooth-charts.service.ts` (update yo'li qo'shish)
- Modify: `packages/db-schema/src/tables/treatment-plans.ts` (`treatment_stages` jadvali SHU faylda — `lab_order_id` ustun) + tooth-state schema (kerak bo'lsa)
- Create: yangi migration(lar) (`bun --filter @dental/api db:generate`)
- Test: `apps/api/tests/integration/` (yangi test fayl(lar))
- Docs: `docs/00-DESIGN-DECISIONS.md` (CLI-487/488 qarori)

**L4 — Isolated (CLI-484, 485, 489)**
- Modify: `apps/api/src/modules/consent/consent.service.ts` (ownership guard)
- Modify: `apps/api/src/modules/lab-orders/lab-orders.service.ts` (ownership guard)
- Modify: `apps/api/src/modules/clinical/diagnoses/diagnoses.repository.ts` (`.limit()`)
- Test: `apps/api/tests/integration/` (yangi test fayl(lar))

---

## Lane implementer briefs (Workflow implementer agent promptlari)

Har brief bir implementer agent'iga beriladi. Umumiy TDD tsikli (har ticket uchun):
1. Tegishli mavjud fayl(lar)ni O'QI (funksiya tanasi, mavjud test pattern'lari `tests/integration/*`).
2. Failing integration test yoz (aniq stsenariy quyida) — `bun test`da FAIL bo'lishini kutasan, **lekin Faza 1'da ISHLATMA** (DB kontensiyasi; typecheck yetarli).
3. Minimal fix implement qil.
4. `bun --filter @dental/api typecheck` + `bun run lint` — yashil.
5. Lane-branch'ga commit qil (`wf/lane-<n>`).

> **Faza 1 qoidasi:** implementer integration-testni ISHLATMAYDI (yagona DB). U faqat typecheck+lint bilan tekshiradi. Red→green isboti Faza 2 verify'da (serial).

### L1 — CLI-479 [Urgent] Payroll refund double-clawback

**Files:** `cashier.service.ts:531-549,617-625`, `payroll.service.ts:87,148-164,411-421`, `tests/integration/cli-446-payroll-adjustments.test.ts`

**Muammo:** `cashier.refund()` ikki mustaqil clawback'ni otadi (dedupsiz): (1) carry-forward `recordRefundAdjustment` (finalized davrga `payroll_adjustment`, `appliedToRunId=NULL`); (2) revenue-query netting (`SUM(CASE WHEN type='refund' THEN -paidAmount ...)`) refundni `createdAt` davriga netlaydi. Bitta refund ikki marta ayiriladi.

**Failing test stsenariysi (raqamli):**
1. Yanvar: doktor D, plan-linked to'lov 1 000 000, komissiya 10% → Yanvar run **finalized**, 100 000 to'landi.
2. Iyul: shu to'lovdan 500 000 refund. **Test'da refund `createdAt`ni finalized-o'tmish EMAS, joriy/keyingi davrga qo'y** (production reallik) — masalan Iyul.
3. Iyul run yaratilganda: D'ning to'g'ri komissiyasi = **50 000** (100 000 Iyul − 50 000 refund-clawback), NOT 0.
4. Test assert: `commissionAmount === 50000` (hozirgi bug'li kodda `0` chiqadi).

> **MAJBURIY (test-masking):** mavjud `cli-446` T1/T3 testlari refund `createdAt`ni wall-clock-hozir qoldirib bug'ni maskalaydi. Yangi test refund `createdAt`ni **aniq set qilib** (o'tmish/joriy davr) double-clawback'ni reprodutsiya qilishi shart.

**Fix yo'nalishi (BITTASINI tanla, ikkalasi emas):**
- (A) revenue-query `payroll_adjustment` (carry-forward) mavjud refund qatorlarini netting'dan **istisno qilsin**, YOKI
- (B) refundning o'z davri run olganda `recordRefundAdjustment` **yozilmasin** (idempotent guard).

Tanlangan yo'lni commit message + test kommentida asosla.

**Effort:** max.

---

### L2 — Queue↔Appointments (ketma-ket: 480 → 482 → 483 → 486)

**CLI-480 [High] `in_progress→no_show` sync jim yiqiladi**
- Files: `appointments.transitions.ts:39`, `queue.service.ts:204-234`.
- Muammo: `queue.transitions.ts:20` `in_progress→missed` ruxsat; `appointments.transitions.ts:39` `in_progress: ['completed','cancelled']` (`no_show` YO'Q); `queue.service.ts:233-234` `AppointmentTransitionError` jim yutiladi → appt abadiy `in_progress`.
- Fix: `appointments.transitions.ts`da `in_progress` massiviga `'no_show'` qo'sh (klinik ma'no: chaqirilib ketib qolgan = no-show). Jim-yutish holatini qayta ko'rib chiq (endi otmasligi kerak; no-show strike `:438` yoziladi).
- Test: queue ticket `in_progress→missed` → appt `no_show` bo'lishini, strike+audit yozilishini, `reports.noShowRate` qamrashini tasdiqla.

**CLI-482 [Medium] Teskari sync: appt cancel/complete → arvoh queue ticket**
- Files: `appointments.service.ts:323-478`, `queue.service.ts`, `app.ts:188-237`.
- Muammo: queue→appt sync bor, teskarisi yo'q; appt cancel/complete bo'lganda ochiq ticket `waiting`/`in_progress`da qoladi.
- Fix: appt update oqimida (cancel/complete) bog'langan ochiq queue ticket'ni yopadigan DI-hook qo'sh (queue→appt patterniga simmetrik; wiring `app.ts`da). Idempotent + audit.
- Test: appt cancel → bog'langan ticket yopiladi; complete → ticket done.

**CLI-483 [Medium] No-show sweep check-in'siz appt'ni qamramaydi**
- Files: `queue.service.ts:275-350` (`sweepNoShows`, `checkInCandidates`).
- Muammo: sweep faqat `queue_tickets`ni supuradi; umuman kelmagan bemor ticket olmaydi → hech qachon `no_show`.
- Fix: sweep queue-ticket'siz, o'tib ketgan `startTime`li `scheduled`/`confirmed` appt'larni ham `no_show` qilsin (appointments seam orqali; strike+recall reopen hooklari otsin).
- Test: ticket'siz o'tmish appt sweep'dan keyin `no_show`.

**CLI-486 [Low] Recall reopen asimmetriyasi**
- Files: `appointments.service.ts:417-434`.
- Muammo: `cancelled→scheduled` reaktivatsiyada `closeOpenOnRebook` chaqirilmaydi (u faqat `create()`da); recall `pending`da qoladi.
- Fix: appt update reaktivatsiya yo'lida (`→scheduled`, before `cancelled`) mavjud `deps.recall?.closeOpenOnRebook(...)`ni chaqir.
- Test: create→cancel→PATCH scheduled ketma-ketligida recall qayta `scheduled` bo'lishini tasdiqla.

**Effort:** high. **Recall:** faqat mavjud metodlar chaqiriladi; `recalls.service.ts` tahrirlanmaydi.

---

### L3 — Treatment-stage (ketma-ket: 481 → 487 → 488)

**CLI-481 [Medium] Visit re-point phantom completed + orphan recall**
- Files: `visit-notes.service.ts:127-130`, `treatment-plans.transitions.ts:61-67`.
- Muammo: visit-note UPDATE yangi `stageId` berilsa faqat yangi stage'ni `completed` qiladi; eski stage revert bo'lmaydi (`completed` terminal) → orphan recall.
- Fix: re-point'da eski stage'ni to'g'ri holatga qaytar (yoki re-point'ni bloklab aniq xato ber) + eski stage'ning auto-recall'ini yop/dismiss. Transition matritsasi terminal-revert'ni qo'llab-quvvatlashi kerak bo'lsa, controlled revert yo'li qo'sh.
- Test: visit-note stage A→B re-point → A revert (yoki bloklangan), A-recall orphan qolmaydi.

**CLI-487 [Feature] Lab-order ↔ stage completion gate**
- Files: `packages/db-schema/src/tables/treatment-plans.ts` (`treatment_stages` jadvaliga yangi ixtiyoriy `lab_order_id` FK→lab_orders), yangi migration, `treatment-plans.service.ts:268-325` (completion guard).
- Fix: `treatment_stages`ga ixtiyoriy `lab_order_id`; bosqichni `completed` qilishda bog'langan lab-order `delivered` emasligini tekshir → agar `draft`/`in_progress` bo'lsa bloklab domen xatosi (`stage.lab_pending` yoki shunga o'xshash). Migration RLS-izchil (tenant-scoped bo'lsa `check:rls` toza).
- Test: lab-linked stage, lab-order `in_progress` → `completed` bloklanadi; lab-order `delivered` → ruxsat.

**CLI-488 [Feature] Odontogram auto-update on stage completed**
- Files: `treatment-plans.service.ts:268-325`, `tooth-charts.service.ts` (update/create yo'li), migration (kerak bo'lsa).
- Fix: bosqich `completed` bo'lganda `stage.toothNumbers` uchun yangi `tooth_states`/snapshot yozadigan hook (immutable-snapshot modeliga mos: yangi snapshot). Idempotent + audit.
- Test: `toothNumbers=[26]`li stage `completed` → tish 26 uchun yangi tooth-state/snapshot yaratiladi.
- Docs: `docs/00-DESIGN-DECISIONS.md`ga CLI-487 (gate) va CLI-488 (auto-snapshot, immutable-modeldan qasddan chetlashish) qarorlarini yoz.

**Effort:** max. **Migration:** ketma-ket generate (481→487→488) — numbering to'qnashuvsiz.

---

### L4 — Isolated (ketma-ket: 484 · 485 · 489)

**CLI-484 [Low] consent.signForm ownership guard**
- Files: `consent.service.ts:121-155`.
- Fix: `signForm`da `input.patientId` uchun `assertPatientExists(patientId)` + `templateId` ownership tekshiruvi qo'sh (prescriptions.create patterni). Nonexistent/cross-tenant → 500 emas, aniq 404/403.
- Test: nonexistent `patientId` → xom 500 emas, aniq xato.

**CLI-485 [Low] lab-orders.create doctorId ownership**
- Files: `lab-orders.service.ts:90-98`.
- Fix: `create`da `assertUserExists(input.doctorId)` chaqir (visit-notes/prescriptions patterni).
- Test: cross-tenant/noto'g'ri `doctorId` → xom 500 emas, aniq xato.

**CLI-489 [Low] diagnoses list unbounded**
- Files: `diagnoses.repository.ts:18`.
- Fix: search'siz shoxga ham `.limit(100)` (yoki majburiy pagination) qo'sh.
- Test: search'siz list ≤100 qator qaytaradi.

**Effort:** medium.

---

## Ijro — Workflow orkestratsiya

### Faza 1 & 2 — `Workflow` tool skripti

`meta.phases = [{title:'Implement'}, {title:'Verify'}]`.

- **Faza 1 (Implement, parallel):** `parallel([L1,L2,L3,L4])`. Har lane thunk bitta implementer `agent(...)` (isolation:'worktree', schema=IMPL_RESULT). Har agent birinchi qadamda `git switch -c wf/lane-<n>`, oxirida commit. Effort: L1/L3=max, L2=high, L4=medium. Agent integration-test ISHLATMAYDI (typecheck+lint only). Qaytaradi: `{branch, tickets[], testFiles[], filesChanged[], migrationsAdded[], notes}`.
- **Faza 2 (Verify, KETMA-KET):** `for` loop (parallel EMAS) — har lane uchun mustaqil `agent(verify prompt, {schema:VERDICT})`. Verifier `git worktree add --detach ../v-lane-<n> wf/lane-<n>` bilan branch-tip'dan detached worktree ochadi (checkout-konflikt yo'q), `bun test --env-file=../../.env` **serial** ishlatadi. Har lane:
  1. Yangi regressiya-test **eski kodda FAIL** ekanini isbotla (fix'ni revert → qizil → restore → yashil). **L1'da majburiy.**
  2. Affected suite'lar yashil.
  3. Fix'ni ticket spec'iga refute-review.
  Qaytaradi: `{lane, redGreenProven, suitesPass, defects[], verdict}`. Defekt → shu slotda fix (implementer'ga qayta) + re-verify.

Skript qaytaradi: `{lanes:[{branch, verdict, defects}]}`. **Skript main'ga MERGE QILMAYDI.**

> Koordinator (men) skriptni ijro oldidan yakuniy shakllantiraman (worktree-branch plumbing'ni muhitga moslab). Agar Workflow worktree-handoff ishonchsiz bo'lsa, fallback: har lane implement+verify bitta lane-agent oqimida (verify baribir serial for-loop'da), lekin verifier alohida agent bo'lib qoladi (adversarial mustaqillik saqlanadi).

### Faza 3 — Integratsiya (koordinator, Workflow tashqarisida, ketma-ket)

- [ ] Har `wf/lane-<n>` uchun `git merge-base main wf/lane-<n>` tekshir (stale-base darsi). Zarur bo'lsa `git merge main` yoki cherry-pick.
- [ ] `git checkout main` (yoki `feat/cli-479-489-treatment-audit`), har lane-branch'ni `--no-ff` merge (ketma-ket). Konflikt kutilmaydi; chiqsa hal qil.
- [ ] Merged tree'da: `bun --filter @dental/api typecheck` (0), `bun run lint` (0), `bun run check:rls` (toza), `cd apps/api && bun test --env-file=../../.env` (to'liq yashil).
- [ ] **Opus whole-branch review** — butun merged diff, cross-task gap (masalan `app.ts` wiring, i18n xato-xabar, RLS) qidiradi.
- [ ] Review blocker'larini tuzat, qayta verify.
- [ ] 11 Linear ticket → Done (per-ticket qisqa izoh: fix + verify natijasi).
- [ ] `00-DESIGN-DECISIONS.md` CLI-487/488 qarorlari mavjudligini tasdiqla.
- [ ] **PUSH YO'Q** — foydalanuvchiga xabar ber, alohida ruxsat so'ra.

---

## Self-Review (spec qamrovi)

- **CLI-479…489** — har biriga task brief bor ✅
- **Product-decisions (487/488 qurish)** — L3'da + `00-DESIGN-DECISIONS.md` ✅
- **Serial verify (test-DB)** — Faza 2 for-loop + detached worktree ✅
- **Inside/after chegara** — skript merge qilmaydi; Faza 3 koordinator ✅
- **L1 test-masking qattiq shart** — CLI-479 brief + Faza 2 majburiy red-green ✅
- **Migration faqat L3** — File Structure + L3 brief ✅
- **Recall call-only** — L2/L3 briefda tasdiqlangan ✅
- **Push yo'q** — Global Constraints + Faza 3 ✅
- **Placeholder:** yo'q — har fix aniq fayl+yo'nalish+test-stsenariy. (Literal TS implementatsiya oldindan yozilmagan: bular mavjud funksiyalarga bug-fix; implementer joriy kodni o'qib TDD qiladi — fabrication'dan qochish uchun qasddan.)
