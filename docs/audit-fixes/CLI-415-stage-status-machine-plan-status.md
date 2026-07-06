# CLI-415 — Bosqich status-mashinasi plan statusini e'tiborsiz qoldiradi

> Audit: MEDIUM M2. Bekor/tugatilgan planда bosqich "completed" bo'la oladi; bekor planда recall fire qiladi.

## Bog'liq ticketlar

- **CLI-414** — visit-note UI'ga `stageId` dropdown qo'shadi. `completeStageForVisit`
  (`treatment-plans.service.ts:212-213`) `updateStage(status:'completed')`'ni chaqiradi, ya'ni
  bu ticket qo'shadigan guard **aynan visit-note→stage oqimini** ham gate qiladi.
  **Yagona siyosat (ikkala doc'da bir xil):** bosqich `completed`/`in_progress` ga faqat plan
  `accepted` yoki `in_progress` bo'lganда o'tadi. CLI-414 UI stageId dropdown'ida faqat shu
  plandagi bosqichlarni ko'rsatadi; 400 kelsa toast.

## 1. Muammo va ildiz sabab

`treatment-plans.service.ts:160-204` `updateStage` faqat **stage o'qlari** (status/acceptance)
transition'ini tekshiradi (`assertStageStatusTransition`, 167-qator) — **parent plan statusini
umuman o'qimaydi**. Natijada:

- Plan `cancelled`/`completed` (terminal) bo'lса ham bosqich `pending→completed` bo'la oladi.
- Plan hali `draft`/`presented` (bemor qabul qilmaganда) bo'lsa ham bosqich "completed".
- Bosqich `completed` bo'lganда recall hook shartsiz ishlaydi (`treatment-plans.service.ts:192-201`)
  → **bekor qilingan plan uchun follow-up recall** yaratiladi.

Plan transition jadvali (`treatment-plans.transitions.ts:39-46`) `completed`/`cancelled`'ni
terminal deб belgilaydi, lekin bu **plan o'qi**; bosqich o'qi undan bexabar.

## 2. Dizayn qarori

**Aniq yechim (tanlangan) — ikki-bosqichli guard `updateStage` boshida:**

1. `updateStage` boshida parent plan'ni **bir marta** olib kelamiz (`repo.findPlan(c, current.treatmentPlanId)`)
   — hozir bu fetch faqat recall uchun 193-qatorда bajariladi; uni yuqoriga ko'chirib **ham guard,
   ham recall** uchun qayta ishlatamiz (bitta so'rov).
2. **(a) Terminal plan** (`cancelled` yoki `completed`) → *har qanday* bosqich mutatsiyasini rad et
   (status/acceptance/notes) → `PlanLockedError` → routes 400.
3. **(b) Ishlanmagan plan** (`draft` yoki `presented`) → bosqichni `completed`/`in_progress` ga
   o'tkazishni rad et (bemor rejaни qabul qilмасдан bosqich ishlаб bo'lmaydi) → 400. `skipped` va
   acceptance/notes o'zgarishlariga ruxsat (reja tuzish davri).
4. Guard tufayli recall hook `cancelled` planда **hech qachon** yetib bormaydi (rad avval otiladi).

**`updatePlan` cross-check:** plan `→ completed` ga o'tayotganда bosqichlar consistentligini
tekshirish. **Siyosat (tanlangan, yengil):** hech bo'lmaganda barcha `accepted` bosqichlar
`completed` yoki `skipped` bo'lishi kerak degan qattiq guard QO'YMAYMIZ (klinik amaliyotда
qisman yopish bo'ladi) — buni **rad etilgan alt** deб belgilaymiz va o'rniga faqat mavjud
`assertPlanTransition`ni saqlaymiz. Asosiy fix — bosqich tomonidagi guard.

**Rad etilgan alternativalar:**

- *Plan `→ completed`da barcha bosqich terminal bo'lsin deб qattiq guard* — real oqimда qisman
  bajarilган rejalар ko'p; noto'g'ri 400 beradi. **Rad:** siyosat sifatida hujjatlashtiriladi, majburlanmaydi.
- *Guardни transitions.ts sof funksiyasiga qo'shish (plan status parametri bilan)* — mumkin, lekin
  `updateStage` allaqачон plan fetch qiladi; alohida `assertStagePlanConsistency(planStatus, toStatus)`
  sof funksiyasi tozaroq. **Qabul:** yangi sof funksiya `transitions.ts`ga qo'shiladi (testlash oson).

## 3. Spec — xulq + chekka holatlar

**Yangi sof funksiya** `assertStageMutationAllowedForPlan(planStatus, patch)`:

| plan.status | Bosqich amali | Natija |
|---|---|---|
| `cancelled` / `completed` | har qanday (status/acceptance/notes) | **400** `stage.plan_locked` |
| `draft` / `presented` | status → `completed` yoki `in_progress` | **400** `stage.plan_not_active` |
| `draft` / `presented` | status → `skipped`, acceptance, notes | OK |
| `accepted` / `in_progress` | har qanday valid stage transition | OK |

**Chekka holatlar:**

- Idempotent bir xil status (`X→X`) — patch bo'sh, `updateStage` erta qaytadi (178-qator) → guardга
  yetmaydi (xavfsiz).
- `completeStageForVisit` (visit-note oqimi) — plan `draft` bo'lса 400 → visit-notes routes
  `InvalidTransitionError`ни emas, yangi guard xatosини ham 400 ga aylantirishi kerak (yoki umumiy
  guard error klassi). **Qaror:** yangi xatolarni ham `InvalidTransitionError` subklassi qilib,
  visit-notes routes'даги mavjud catch (`visit-notes.routes.ts:99-104`) o'zgармаsdаn 400 bersin.
- Recall: `cancelled` planda bosqich completed qilishга urиниш 400 → recall yaratilmaydi (tasdiqlanadi test bilan).

**Test caselar (bun test):**

1. `cancelled` planда bosqichни `completed` qilish → 400, recall yaratilмади (recalls jadvали bo'sh).
2. `completed` planда bosqich acceptance o'zgartirish → 400.
3. `draft` planда bosqich `completed` → 400.
4. `draft` planда bosqich `skipped` → OK.
5. `in_progress` planда bosqich `completed` → OK + recall yaratildi (mavjud xulq saqlanadi).
6. `completeStageForVisit` (visit-note create) `cancelled` planда → 400 (visit-note orphan yaratilmaydi).

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `treatment-plans.service.test.ts` (yoki integration)ga 6 case; hozir 1,2,3,6 qizil.
2. **Impl:**
   - `treatment-plans.transitions.ts`: `assertStageMutationAllowedForPlan(planStatus, {toStatus?})`
     sof funksiya + tegishли `InvalidTransitionError` subklass(lar) (`PlanLockedError`,
     `PlanNotActiveError`) yoki bitta `InvalidTransitionError('stage_status', ...)` reuse.
   - `treatment-plans.service.ts` `updateStage`: boshida `const plan = await repo.findPlan(c, current.treatmentPlanId)`
     (193-qatordan yuqoriga ko'chir), guardни chaqir; recall bloki o'sha `plan`ни qayta ishlatsin
     (qo'shimcha fetch yo'q).
3. **Verify:** `bun test` yashil; `bun run typecheck`.

## 5. Migratsiya / rollout / xavflar

- **Migratsiya YO'Q** — sof mantiq.
- **Xavf:** mavjud ma'lumotда `draft`/`presented` planда allaqачон `completed` bosqichlar bo'lsa,
  ular o'zgармaydi (guard faqat *yangi* transition'ларга); regressiya yo'q.
- **UI hamohangligi:** CLI-414 stageId dropdown faqat workable plan bosqichларини ko'rsатса,
  foydаlanuvchi kamдан-kam 400 ko'radi; baribir 400 toast bilan boshqariladi.
- **Rollout:** feature-branch, TDD, lokal verify, main merge.

## 6. Qabul mezonlari

- [ ] `cancelled`/`completed` planда bosqich mutatsiyasi → 400.
- [ ] `draft`/`presented` planда bosqich `completed`/`in_progress` → 400; `skipped`/notes OK.
- [ ] `in_progress`/`accepted` planда bosqich completed → OK + recall (mavjud xulq).
- [ ] `cancelled` planда recall **fire qilmaydi**.
- [ ] Plan bir marta fetch qilinadi (guard + recall reuse).
- [ ] `bun test` + `typecheck` yashил.

## 7. Ta'sirlangan fayllar

- `apps/api/src/modules/clinical/treatment-plans/treatment-plans.transitions.ts` (yangi guard fn)
- `apps/api/src/modules/clinical/treatment-plans/treatment-plans.service.ts:160-204` (updateStage guard + plan reuse)
- (ehtimol) `apps/api/src/modules/clinical/visit-notes/visit-notes.routes.ts` — catch klassini kengaytirish (agar yangi xato klassi InvalidTransitionError subklassi bo'lmasa)
- Testlar: `treatment-plans.service` (API)
