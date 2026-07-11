# Treatment-flow audit — 11 task, 1 Workflow orkestratsiyasi (dizayn)

**Sana:** 2026-07-11
**Manba audit:** 2026-07-10 davolash-oqimi seam-audit (Linear label `audit-2026-07-10`, CLI-479…489)
**Maqsad:** 11 ta ochiq ticketni bitta Workflow orkestratsiyasida, parallel worktree-izolyatsiyalangan subagentlar bilan hal qilish.

---

## 1. Scope

**Qamrab olinadi (11 kod-task):** CLI-479, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489.

**Qamrab OLINMAYDI:**
- **9 BLOCKED ticket** (tashqi kredensial/infra/hardware): CLI-361, 376, 377, 378, 380, 381, 384, 385, 386. Kod bilan hal bo'lmaydi — hozirgi workflow'dan tashqarida.

**Product-decision qarorlari (foydalanuvchi tomonidan tasdiqlangan 2026-07-11):**
- **CLI-487 — Gate QURILADI.** Lab-bog'liq bosqich (koronka/protez) bog'langan lab-order `delivered` bo'lmaguncha `completed` bo'la olmaydi. `treatment_stages.lab_order_id` linkage + completion guard + migration + FK.
- **CLI-488 — Auto-update QURILADI.** Bosqich `completed` bo'lganda `stage.toothNumbers` uchun yangi `tooth_states`/snapshot yaratiladi (odontogram avtomatik yangilanadi). Immutable-snapshot modelidan qasddan chetlashish — `00-DESIGN-DECISIONS.md`ga yoziladi.

---

## 2. Ticketlar — muammo va fix yo'nalishi

| Ticket | Pr | Muammo (seam) | Fix yo'nalishi | Fayllar |
|---|---|---|---|---|
| **CLI-479** | 🔴 Urgent | Finalized payroll davriga tushgan refund komissiyani IKKI marta qaytaradi (carry-forward adjustment ↔ revenue-query netting dedupsiz). CLI-446 p3 regressiyasi, test-masked | revenue-query `payroll_adjustment`li refund qatorlarini istisno qilsin **YOKI** refundning o'z davri run olganda adjustment yozilmasin — **bittasi**, ikkalasi emas | `cashier.service.ts:531-549,617-625`, `payroll.service.ts:87,148-164,411-421`, `cli-446-payroll-adjustments.test.ts` |
| **CLI-480** | 🟠 High | Queue `in_progress→missed` → appt `no_show` sync jim yiqiladi (matritsalar zid; `AppointmentTransitionError` jim yutiladi) | Appt matritsasi `in_progress→no_show`ga ruxsat bersin (klinik ma'no: chaqirilib ketib qolgan bemor = no-show) | `queue.transitions.ts:20`, `appointments.transitions.ts:39`, `queue.service.ts:204-234`, `appointments.service.ts:438` |
| **CLI-481** | 🟡 Medium | Visit-note re-point yangi stage'ni `completed` qiladi, eski stage revert bo'lmaydi ("phantom completed") + orphan recall | Re-point'da eski stage'ni revert (yoki bloklash) + eski stage'ning auto-recall'ini yop/dismiss | `visit-notes.service.ts:127-130`, `treatment-plans.transitions.ts:61-67` |
| **CLI-482** | 🟡 Medium | Teskari sync yo'q: appt cancel/complete bo'lganda ochiq queue ticket "arvoh" bo'lib qoladi | Appt update oqimida queue ticket'ni ham sync qil (cancel/complete → ticket yop) | `appointments.service.ts:323-478`, `queue.service.ts`, `app.ts:188-237` |
| **CLI-483** | 🟡 Medium | No-show sweep faqat check-in qilingan (queue ticket olgan) appt'ni qamraydi; umuman kelmagan bemor hech qachon `no_show` bo'lmaydi | Sweep queue-ticket'siz, o'tib ketgan `startTime`li scheduled/confirmed appt'larni ham `no_show` qilsin | `queue.service.ts:275-350` |
| **CLI-484** | 🟢 Low | `consent.signForm` ownership-guard'ni o'tkazib yuboradi → cross-tenant FK → xom 500 | `assertPatientExists(patientId)` + template ownership tekshiruvi qo'sh | `consent.service.ts:121-155` |
| **CLI-485** | 🟢 Low | `lab-orders.create` `doctorId` ownership tekshirmaydi → xom 500 | `assertUserExists(doctorId)` qo'sh (visit-notes/prescriptions patterni) | `lab-orders.service.ts:90-98` |
| **CLI-486** | 🟢 Low | Recall reopen asimmetriyasi: appt `cancelled→scheduled` reaktivatsiyada recall qayta yopilmaydi | Reaktivatsiya yo'lida `closeOpenOnRebook` chaqir (mavjud metod) | `appointments.service.ts:417-434` |
| **CLI-487** | ⚪→Feature | Lab-order ↔ stage gating yo'q | `treatment_stages.lab_order_id` (ixtiyoriy) + completion guard: lab-linked stage `delivered`siz `completed` bo'lmaydi | `treatment-plans.service.ts:268-325`, `packages/db-schema/.../lab-orders.ts` yoki `treatment-stages`, yangi migration |
| **CLI-488** | ⚪→Feature | Odontogram stage completed'da avto-yangilanmaydi | Stage `completed` → `stage.toothNumbers` uchun `tooth_states`/snapshot auto-yozuv; `tooth-charts.service`ga update yo'li | `treatment-plans.service.ts:268-325`, `tooth-charts.service.ts`, yangi migration |
| **CLI-489** | 🟢 Low | Diagnoses list `.limit()`siz — search'siz butun katalog | Search'siz shoxga ham `.limit()` (yoki majburiy pagination) | `clinical/diagnoses/diagnoses.repository.ts:18` |

---

## 3. Topologiya — 4 parallel lane

Fayl-lokalligiga asoslangan klasterlash. Lane'lar **parallel** (bir-birining fayllariga tegmaydi); lane ichidagi tasklar **ketma-ket** (umumiy fayl).

| Lane | Tasklar (tartib) | Asosiy fayllar | Effort |
|---|---|---|---|
| **L1 — Payroll** | CLI-479 | `cashier.service.ts`, `payroll.service.ts`, `cli-446-*.test.ts` | **max** |
| **L2 — Queue↔Appt** | 480 → 482 → 483 → 486 | `queue.service.ts`, `queue.transitions.ts`, `appointments.service.ts`, `appointments.transitions.ts`, `app.ts` | high |
| **L3 — Treatment-stage** | 481 → 487 → 488 | `treatment-plans.service.ts`, `treatment-plans.transitions.ts`, `visit-notes.service.ts`, `tooth-charts.service.ts`, `packages/db-schema/*`, migrations | **max** |
| **L4 — Isolated** | 484 · 485 · 489 (lane ichida ketma-ket) | `consent.service.ts`, `lab-orders.service.ts`, `diagnoses.repository.ts` | medium |

**Nega lane'lar mustaqil:** recall bog'lanishi to'g'ridan-fayl-tahriri EMAS — DI-hook orqali (`deps.recall?.<method>`). L2 (`closeOpenOnRebook`/`autoCreatePreventive`/`reopenOnCancel`) va L3 (`autoCreateFromStage`) **mavjud** recall metodlarini chaqiradi, `recalls.service.ts`ni tahrirlamaydi. Ko'pi bilan L3 (CLI-481 orphan-recall) yangi "dismiss/close" metod qo'shishi mumkin — u **bitta lane ichida** qoladi. Cross-lane konflikt yo'q.

---

## 4. Faza strukturasi

### Faza 1 — Implement (parallel, 4 lane)
- Har lane implementer worktree-izolyatsiyada ishlaydi (`isolation: 'worktree'`).
- TDD: failing test yozadi → implement → `tsc --noEmit` typecheck + biome.
- **Integration-test ISHLATMAYDI** (yagona test-DB kontensiyasini oldini olish; typecheck DB'siz ishlaydi).
- Har lane o'z branch'iga commit qiladi.
- L1/L3 = max effort; L2 = high; L4 = medium.

### Faza 2 — Verify (KETMA-KET, bir vaqtda 1 lane)
- Mustaqil adversarial verifier (refute-yo'naltirilgan) lane-branch'ni oladi.
- Integration-testni **serial** ishlatadi (bir vaqtda faqat bitta lane DB'ga tegadi → clobber yo'q).
- Har lane uchun:
  1. Yangi regressiya-test **eski kodda FAIL** bo'lishini isbotlaydi (fix'ni stash/revert → test qizil → restore → test yashil).
  2. Lane'ning affected suite'larini ishlatadi.
  3. Fix'ni ticket spec'iga qarshi refute-review qiladi.
- **L1'da MAJBURIY qattiq shart:** yangi test refund `createdAt`ini finalized-o'tmish davriga qo'yib double-clawback'ni reprodutsiya qilsin; "test o'tdi" yetarli emas — "eski kodda fail, yangi kodda pass" talab.
- Defekt topilsa → shu lane slotida fix (implementer'ga qaytariladi yoki verifier tuzatadi), qayta verify.

### Faza 3 — Integrate (Workflow TASHQARISIDA, koordinator/main-loop ketma-ket)
- Har lane-branch uchun `git merge-base main <branch>` tekshiruvi (stale-base darsi, memory).
- Lane-branch'lar → lokal `main`ga `--no-ff` merge (ketma-ket). Cross-lane konflikt kutilmaydi; chiqsa shu yerda hal qilinadi.
- Merged `main`da: to'liq `bun test` + `tsc` typecheck + biome + `check:rls`.
- **Opus whole-branch review** (butun merged diff bo'yicha, cross-task gap qidiradi).
- 11 ta Linear ticket → Done.
- CLI-487/488 xulqi → `00-DESIGN-DECISIONS.md`.
- **PUSH YO'Q** (lokal merge; push faqat foydalanuvchi alohida ruxsat bergach).

---

## 5. Muvaffaqiyat mezoni

- [ ] 11 ticket kodlangan, har biri regressiya-testli
- [ ] L1/L3 migration'lari yashil; migration numbering to'qnashuvsiz (faqat L3 chiqaradi)
- [ ] Merged `main`: `bun test` to'liq yashil, typecheck 0, biome 0, `check:rls` toza
- [ ] Opus whole-branch review 0 blocker
- [ ] Barcha 11 ticket Linear Done
- [ ] CLI-487/488 `00-DESIGN-DECISIONS.md`ga hujjatlangan

---

## 6. Xavflar va mitigatsiya

| Xavf | Mitigatsiya |
|---|---|
| Yagona test-DB (`localhost:5433/dental`) parallel test-run'da clobber | Faza 2 verify **ketma-ket** (bir vaqtda 1 lane) |
| Migration numbering to'qnashuvi | Faqat L3 migration chiqaradi, ketma-ket (481→487→488) |
| Worktree stale-base'dan boshlanishi (memory darsi) | Har branch `main`dan; merge oldin `git merge-base` tekshiruvi; zarur bo'lsa `git merge main` yoki cherry-pick |
| L2/L3 recall orqali bog'lanib qolishi | DI-hook = call-only; shared `recalls.service.ts` tahriri ko'pi bilan L3 ichida |
| Peak concurrency Docker'ni yiqitishi (11 parallel ilgari yiqitgan) | Maks 4 lane parallel (L4 o'z 3 tasini ketma-ket) — chegaradan ancha past |
| Test-masking (CLI-479) fix'ni ham yashirishi | L1 verify'da "eski kodda fail" isboti majburiy |
| Cross-task gap (masalan wiring app.ts'da unutilishi) | Yakuniy opus whole-branch review + to'liq `bun test` merged main'da |

---

## 7. Ijro vositasi

`Workflow` tool (foydalanuvchi aniq so'ragan). Skript:
- `meta.phases`: `[{title:'Implement'}, {title:'Verify'}]`
- Faza 1: `parallel([lane1, lane2, lane3, lane4])` — har thunk lane-implementer(lar)ni ketma-ket ishlatadi, `isolation:'worktree'`, structured schema qaytaradi (branch, tickets, testFiles, filesChanged, notes).
- Faza 2: **ketma-ket** for-loop (parallel EMAS) — har lane verifier'i serial test bilan.
- Faza 3 (merge/review/Done) — skript ichida EMAS; koordinator (main-loop) bajaradi.

Aniq skript writing-plans bosqichida yoziladi.
