# CLI-416 — Bemor balansi debt-statusda bo'lmagan planlarga to'lovni tashlaydi

> SPEC + IMPLEMENTATSIYA REJASI (kod o'zgartirilmagan). Audit: `AUDIT-2026-07-06.md` M3.

## 1. Muammo va ildiz sabab

Bemor balansining **allocation (paid) SUM** query'si plan statusi bo'yicha filtrlanadi — bu C4 invariantiga zid.

`patients.service.ts:122-136` (`listWithBalances`, allocation tomoni):
```ts
db.select({ patientId: ..., sum: SUM(treatmentStagePayments.amount) })
  .from(treatmentStagePayments)
  .innerJoin(treatmentStages, ...)
  .innerJoin(treatmentPlans, ...)
  .where(and(
    inArray(treatmentPlans.patientId, ids),
    inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES]),   // ← MUAMMO
  ))
```

`patients.service.ts:197-207` (`balanceFor`, allocation tomoni) — bir xil `inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES])` filtri `:205`.

`DEBT_PLAN_STATUSES = ['accepted','in_progress','completed']` (`:61`). Ya'ni plan `cancelled`/`draft`/`presented` bo'lsa, unga tegishli **to'lovlar SUM'dan tushib qoladi**.

**C4 invarianti (`cashier.billing.ts:62-72` va `computePlanBalance`):**
> Allocation (paid) **HECH QACHON filtrlanmaydi** → exclude bo'lgan, lekin to'langan bosqich manfiy (kredit) balans beradi (ghost-allocation tuzog'idan saqlaydi).

`computePlanBalance` (`:85-94`) plan-status'ni faqat **cost tomoniga** qo'llaydi (`planExcluded` → `cost=0`), `paid` esa doim saqlanadi (`paidByStage`). Ya'ni per-plan hisob to'g'ri kredit ko'rsatadi, **bemor-darajali hisob esa noto'g'ri** — allocation'ni ham filtrlaydi.

**Ssenariy (audit):** bemor accepted planga 500,000 to'ladi, keyin plan `cancelled` bo'ldi.
- Per-plan balans (`planBalance`/`computePlanBalance`): cost=0 (cancelled), paid=500,000 → balans **−500,000** (klinika 500k qarzdor / bemor krediti).
- Bemor-darajali balans (`balanceFor`/`listWithBalances`): cost tomoni 0 (cancelled chiqarilgan) VA allocation tomoni ham cancelled'ni chiqaradi → paid=0 → balans **0**. **Kredit yo'qoladi.**

Comment ham noto'g'ri: `:115-116` "allocation SUM (pastda) FILTRLANMAYDI" deydi, lekin `:133`/`:205` da FILTRLANADI — kod izohga zid.

## 2. Dizayn qarori

**DECISION (task bilan berilgan):** allocation-SUM query'laridan `inArray(treatmentPlans.status, DEBT_PLAN_STATUSES)` filtrini OLIB TASHLASH — allocation'lar hech qachon plan statusi bo'yicha filtrlanmasin (hujjatlangan C4 invariantini tiklash). **Cost tomoni o'z plan-status semantikasini saqlaydi** (debt cost faqat accepted/in_progress/completed plan + accepted stage + non-skipped).

Bu bilan bemor-darajali hisob `computePlanBalance`'ning "paid never filtered" xulqiga to'liq mos keladi: cost `DEBT_PLAN_STATUSES` bilan cheklanadi, paid esa barcha statuslardagi plan uchun yig'iladi → cancelled-after-pay krediti bemor darajasida ham ko'rinadi.

Allocation query hali ham `treatmentPlans` bilan join qiladi (patientId olish uchun) — join saqlanadi, faqat status predikati olib tashlanadi.

**Rad etilgan alternativa:** cost tomonini ham filtrsiz qilish (barcha statuslar cost'ga kiradi) — rad: bu C4/Qaror #24'ni buzadi (cancelled/draft plan qarz yaratmasligi kerak); `computePlanBalance` bilan divergensiya paydo qiladi.

## 3. Spec — xulq + edge case'lar + test case'lar

**Invariant (C4):** bemor balansi = Σ(debt cost) − Σ(barcha allocation) + nonPlanRemainder. Allocation SUM plan statusidan mustaqil. Bemor-darajali balans = Σ per-plan `computePlanBalance` (bir xil bemor rejalari bo'yicha) + nonPlan.

Edge case'lar:
- **E1 — accepted planga to'lov, keyin cancel:** stage cost=500000, to'lov=500000, keyin plan `cancelled`. Bemor balans = −500000 (kredit) — per-plan bilan mos.
- **E2 — draft planga oldindan to'lov:** plan `draft`, allocation=200000 → cost 0 (draft debt bermaydi), paid 200000 hisoblanadi → balans −200000 kredit.
- **E3 — aralash:** bir accepted plan (cost 300000, paid 300000, balans 0) + bir cancelled plan (paid 100000, cost 0, balans −100000) → bemor balans −100000.
- **E4 — nonPlan alohida:** nonPlanRemainder tomoni (`cashierTransactions`, `type='payment' status='completed' plan_id IS NULL`) o'zgarmaydi.
- **E5 — refund negative allocation:** cancelled planga to'lov keyin refund → negative allocation ham filtrsiz yig'iladi → to'g'ri.

Konkret test case'lar (`bun test`, `balanceFor` + `listWithBalances`):
1. `credit-survives-plan-cancel`: accepted plan + stage + 500000 allocation → `balanceFor().balance === -500000`; plan `cancelled` qil → **hali ham −500000** (hozir 0 qaytaradi — qizil).
2. `patient-level-matches-per-plan`: bir xil bemor uchun `balanceFor()` === Σ `cashierService.planBalance()` per plan + nonPlan.
3. `list-with-balances-consistent`: `listWithBalances` cancelled-after-pay bemor uchun `balanceFor` bilan bir xil balans.
4. `debt-cost-still-status-gated`: cancelled plandagi stage cost qarz sifatida SANALMAYDI (faqat kredit) — cost tomoni filtri saqlanganini tasdiqlaydi.

## 4. Implementatsiya rejasi (TDD)

1. **Failing test** — `apps/api/tests/integration/cli-416-patient-balance-plan-status.test.ts` (test #1-4). Test #1 hozir `balance === 0` bilan **qizil**.
2. **Impl** — `patients.service.ts` ikki allocation-SUM query'sidan status filtrini olib tashlash:
   - `listWithBalances` (`:130-135`): `.where(and(inArray(treatmentPlans.patientId, ids), inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES])))` → `inArray(treatmentPlans.status, ...)` OLIB TASHLANADI, faqat `inArray(treatmentPlans.patientId, ids)` qoladi.
   - `balanceFor` (`:202-207`): `.where(and(eq(treatmentPlans.patientId, patientId), inArray(treatmentPlans.status, [...DEBT_PLAN_STATUSES])))` → status predikati OLIB TASHLANADI, faqat `eq(treatmentPlans.patientId, patientId)` qoladi.
   - **Cost tomoni (`:109-120`, `:186-195`) o'zgarmaydi** (status + acceptance + skipped filtrlari saqlanadi).
   - `:115-116` va `:191` izohlarni to'g'rila (endi kod izohga mos: allocation FILTRLANMAYDI).
3. **Verify** — `cd apps/api && bun test --env-file=../../.env cli-416-patient-balance-plan-status`; `patient-balance` / `cashier-plan-balance` regressiyasiz (per-plan bilan mosligini tasdiqlaydi); `bun run typecheck`.

## 5. Migratsiya / rollout / xavflar

- **Migratsiya yo'q** — sof read-path mantiq. Saqlanadigan balans yo'q (computed).
- **Rollout ta'siri:** cancelled/draft/presented planlarga oldin to'lov qilgan bemorlar endi bemor-darajasida **kredit (manfiy balans)** ko'rsatadi — bu C4'ning to'g'ri xulqi, per-plan ko'rinish bilan izchil. Registratura/kassa UI kredit ko'rsatishga tayyor (StatusPill/format allaqachon manfiy balansni qo'llaydi).
- **Xavf — kredit "sizib chiqishi" xavotiri:** filtr olib tashlanishi klinika xohlamagan kredit ko'rsatishi mumkin (masalan atayin bekor qilingan planga qaytarilmagan to'lov). Ammo bu **haqiqiy holat** (bemor pul to'lagan, xizmat bekor qilingan) — yashirish emas, ko'rsatish to'g'ri; refund oqimi bilan hal qilinadi. Blocker emas.
- **Cross-plan izchillik:** endi bemor-darajali balans = Σ per-plan balans + nonPlan — regressiya testi (#2) buni majburlaydi.

## 6. Qabul mezonlari

- [ ] Ikki allocation-SUM query'sidan `inArray(treatmentPlans.status, DEBT_PLAN_STATUSES)` olib tashlangan.
- [ ] Cost-SUM query'lari status/acceptance/skipped filtrlarini saqlaydi.
- [ ] Accepted-then-cancelled plan krediti bemor balansida ko'rinadi (test #1).
- [ ] Bemor-darajali balans = Σ per-plan `computePlanBalance` + nonPlan (test #2, #3).
- [ ] Cancelled plan cost qarz sifatida sanalmaydi (test #4).
- [ ] `:115-116`, `:191` izohlar kod bilan mos.
- [ ] `patient-balance` / `cashier-plan-balance` regressiyasiz; `bun run typecheck` toza.

## 7. Ta'sirlangan fayllar

- `apps/api/src/modules/patients/patients.service.ts` — `listWithBalances` (`:130-135`) va `balanceFor` (`:202-207`) allocation-SUM query'laridan status filtri olib tashlanadi; `:115-116`/`:191` izohlar to'g'rilanadi.
- `apps/api/tests/integration/cli-416-patient-balance-plan-status.test.ts` — YANGI.
- (O'zgarishsiz, tasdiq uchun:) `apps/api/src/modules/patients/patients.balance.ts`, `apps/api/src/modules/cashier/cashier.billing.ts` (`computePlanBalance` — yagona C4 manba).
