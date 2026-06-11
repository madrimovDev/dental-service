# R2 — Billing poydevori (treatment-plan to'lov allocation + balans): Design Spec

- **Sana:** 2026-06-11
- **Epik:** R2 / Linear CLI-49 (Kassa) ning shared backend poydevori; R3 bemor-balansiga asos
- **Bog'liq:** [RFC-0009](../../rfcs/0009-backend-module-architecture.md), cashier moduli, treatment-plans (clinical), advisor-qaror (Kassa/Klinik chegarasi)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r2-billing` (main'dan; **birinchi quriladi, Kassa-UI'dan oldin**)

## Maqsad

Treatment-plan bosqichlari uchun **per-bosqich to'lov kuzatuvi va plan balansi** — alohida, mustaqil backend poydevor. Kassa-UI (CLI-49) shu poydevorni iste'mol qiladi; R3 bemor-balansi ham shu modelni qayta qurmay iste'mol qiladi. Klinik (CLI-52) plan UI **payment-agnostik** qoladi.

## Nega alohida unit (advisor)

Per-bosqich to'lov Kassa va Klinikni bog'laydi (ikkalasi treatment-plan domeniga tegadi). Toza chegara: **Kassa billing'ga egalik qiladi** (yangi allocation jadval + balans), treatment-plan jadvallarini faqat **o'qiydi**. `treatment_stages`'ga to'lov ustunlari **qo'shilmaydi** (Klinik egaligidagi jadvalni o'zgartirmaslik). Bu schema chegarasini toza saqlaydi va parallel build'ni mumkin qiladi.

## Qamrov

**Ichida:** yangi `treatment_stage_payments` allocation jadval, `cashier_transactions.treatment_plan_id` FK, allocation yozish (transaction create'da), refund negatsiyasi, **computed balans** (plan + per-bosqich), balans endpoint. Backend-only (UI yo'q).

**Tashqarida:**
- Balans/allocation UI → Kassa spec (CLI-49).
- Klinik plan UI'da to'lov statusi → R3.
- `treatment_stages` ustun o'zgarishi → YO'Q.
- Bemor umumiy balansi (barcha plan/tranzaksiya bo'yicha) → R3 (bu poydevor ustiga quriladi).

## 1. Schema (RFC-0009)

### 1.1 Yangi jadval — `treatment_stage_payments`
```
treatment_stage_payments
├── id            uuid pk
├── tenant_id     uuid NOT NULL → tenants (cascade)   # tenant-scoped, RLS
├── transaction_id uuid NOT NULL → cashier_transactions (cascade)
├── stage_id      uuid NOT NULL → treatment_stages (cascade)
├── amount        numeric(14,2) NOT NULL   # ijobiy = to'lov, manfiy = refund negatsiyasi
└── created_at    timestamptz NOT NULL default now()
```
Indexlar: `(tenant_id, stage_id)`, `(transaction_id)`. **FORCE RLS** (tenant-scoped) — `check:rls` lint talab qiladi.

### 1.2 `cashier_transactions.treatment_plan_id`
Nullable FK → `treatment_plans(id) ON DELETE SET NULL` + index. Migratsiya.

### 1.3 Migratsiya
`drizzle-kit generate` → review (faqat shu ikki o'zgarish + yangi jadval RLS policy) → commit. Yangi tenant-scoped jadval uchun RLS policy migration ham (mavjud pattern bo'yicha — boshqa jadvallar kabi `FORCE ROW LEVEL SECURITY` + policy).

## 2. Cashier moduli kengaytmasi (billing Kassa'ga tegishli)

### 2.1 `cashier.schema.ts`
- `createTransactionSchema` ga ixtiyoriy:
  - `treatmentPlanId: z.uuid().optional()`
  - `allocations: z.array(z.object({ stageId: z.uuid(), amount: z.number().positive() })).optional()`
- Validatsiya: `allocations` yig'indisi `paidAmount`dan oshmasligi (yoki teng) — service'da tekshiriladi.

### 2.2 `cashier.service.ts`
- **`create`** — `treatmentPlanId` saqlash; `allocations` bo'lsa, transaction insert'dan keyin har allocation uchun `treatment_stage_payments` row (`amount` ijobiy) — bitta transaksiyada (RLS tx-bound).
- **`refund`** — mavjud refund-tip tranzaksiya yaratadi; agar asl tranzaksiyada allocation'lar bo'lsa, **negatsiya**: refund transaction uchun har asl allocation'ga `amount` manfiy (`-amount`) row qo'shiladi (xuddi shu `stage_id`). Balans avtomatik tiklanadi.
- **`planBalance(c, planId)`** — yangi. Plan bosqichlari (`treatment_stages` o'qiladi) + allocation yig'indilari:
  - per-bosqich: `paid = Σ amount (stage_id)`, `remaining = stage.cost - paid`
  - plan: `totalCost = Σ stage.cost`, `totalPaid = Σ paid`, `balance = totalCost - totalPaid`
  - Sof o'qish; saqlanmaydi.

### 2.3 `cashier.routes.ts`
- Yangi: `GET /api/cashier/plan-balance/:planId` `requirePermission('cashier.view')` → `service.planBalance`.
- Mavjud `POST /transactions` body endi `treatmentPlanId` + `allocations` qabul qiladi.

### 2.4 api-client
- `cashier.create` body → `treatmentPlanId?`, `allocations?`.
- Yangi `cashier.planBalance(planId)` → `{ totalCost, totalPaid, balance, stages: [{ stageId, serviceName, cost, paid, remaining }] }`.
- Tip: `PlanBalance`, `StageBalance`.

## 3. Refund negatsiyasi — to'g'rilik

- Asl payment tx allocation: `[{stage S1, +100000}]`. Plan balans `remaining(S1) -= 100000`.
- Refund tx (refund-tip): allocation `[{stage S1, -100000}]`. `paid(S1)` 0 ga qaytadi, `remaining` tiklanadi.
- Qisman to'lov: bir bosqich bir necha tranzaksiyada to'lanishi mumkin (allocation'lar yig'iladi).
- Bir tranzaksiya bir necha bosqichni to'lashi mumkin (bir nechta allocation).

## 4. Testlar

> Backend service unit-test harness yo'q (faqat `tests/integration/rls.test.ts`). Shuning uchun **balans hisobini sof funksiyaga ajratib** (`computePlanBalance(stages, allocations)`) **alohida vitest unit** yoziladi (`cashier.billing.test.ts` yoki `apps/api` ichida sof helper test) — bu eng muhim mantiq. Service integratsiya/typecheck + manual.
- `computePlanBalance`: per-bosqich paid/remaining; plan balance; refund negatsiyasi (manfiy allocation → balans tiklanadi); qisman to'lov; multi-stage.

## 5. Verifikatsiya

- `bun --filter @dental/api typecheck` + `bun --filter @dental/api-client typecheck` + sof helper vitest + `check:rls` (yangi jadval policy bilan).
- Migratsiya `db:generate` → review (yangi jadval + FK + RLS policy).
- Dev fidelity (inson): allocation yoziladi, balans to'g'ri hisoblanadi, refund negatsiya qiladi.

## Qurilish tartibi (plan'da)

1. Schema: `treatment_stage_payments` jadval + `cashier_transactions.treatment_plan_id` + migratsiya + RLS policy.
2. `computePlanBalance` sof helper + unit test (TDD).
3. `cashier.service` — `create` allocation, `refund` negatsiya, `planBalance`.
4. `cashier.schema` + routes + api-client.
5. Verifikatsiya.

## Build topologiya (muhim)

Bu poydevor **birinchi quriladi va merge qilinadi**. Keyin Kassa-UI (CLI-49) main-with-billing'dan branch oladi. Klinik/Settings/Xizmatlar billing'ga bog'liq emas — mustaqil parallel.

## Ochiq mayda nuqtalar (plan'da)

- RLS policy migration'ni Drizzle generate qiladimi yoki qo'lda SQL kerakmi — mavjud jadval migratsiyalari patternini ko'rib aniqlash (boshqa tenant-scoped jadvallar qanday policy olgan).
- `allocations` yig'indisi `paidAmount`ga teng emasligi (qisman) ruxsat etiladimi — ha (qisman to'lov), lekin `> paidAmount` rad etiladi.
- `planBalance` permission — `cashier.view` (yoki `treatment_plan.view`?) — plan'da aniqlanadi.
