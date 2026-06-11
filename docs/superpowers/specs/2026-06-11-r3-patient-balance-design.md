# R3 — Bemor balansi (computed, plan-inclusive): Design Spec

- **Sana:** 2026-06-11
- **Epik:** R3 / Linear **CLI-67** (M6 — R3 Ko'ndalang qatlam, parent CLI-65)
- **Bog'liq:** [RFC-0005](../../rfcs/0005-patient-balance-ledger.md) (yangilanadi — pastga qarang), Qaror #11 billing poydevori, [billing spec](./2026-06-11-r2-billing-foundation-design.md), [RFC-0009](../../rfcs/0009-backend-module-architecture.md), [RFC-0010](../../rfcs/0010-frontend-feature-architecture.md)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r3-patient-balance` (main'dan)

## Maqsad

Bemorning **umumiy balansi** (qarz/kredit) — bemorlar ro'yxati (Balans ustuni), kassa ("eski balans" carry-forward), bemor kartasi (balans + To'lovlar tarixi) uchun. Balans **hisoblanadi (computed)**, saqlanmaydi. R2 billing poydevori (`treatment_stage_payments` allocation) **iste'mol qilinadi, qayta qurilmaydi** (Qaror #11).

## Asosiy qaror: plan-inclusive model

Balans ikki manbani qamraydi (brainstorm qarori):
1. **Plan qarzi** — qabul qilingan davolash rejalari bosqich xarajatlari, allocation'lardan keyin.
2. **Plansiz qoldiq** — davolash rejasiga bog'lanmagan kassa tranzaksiyalari qoldig'i.

Bu RFC-0005 ning eski "faqat `cashier_transactions` SUM" modelidan ajraladi (RFC-0005 yangilanadi — §6).

### Formula

```
patient_balance = planDebt + nonPlanBalance
```

**planDebt** — status ∈ {`accepted`, `in_progress`, `completed`} rejalardan (`draft` / `presented` / `cancelled` chiqariladi — `presented` hali taklif, bemor rozi emas):
```
planDebt = Σ(treatment_stages.cost)  −  Σ(treatment_stage_payments.amount)
```
- Allocation'lar refund negatsiyasini (manfiy rowlar, Qaror #11) o'zi nettlaydi → refund alohida ishlov talab qilmaydi.
- Ikki yig'indi **mustaqil** hisoblanadi (join fan-out yo'q): stage.cost yig'indisi va allocation yig'indisi alohida.

**nonPlanBalance** — plansiz kassa:
```
nonPlanBalance = Σ (type='payment' ∧ status='completed' ∧ treatment_plan_id IS NULL) (totalAmount − paidAmount)
```
- Refund asl tranzaksiyani `voided` qiladi (`cashier.service.refund` mavjud mexanikasi) → avtomatik chiqib ketadi.
- `refund` / `void` tipli va plan-linked (`treatment_plan_id IS NOT NULL`) tranzaksiyalar bu yig'indida **sanalmaydi** → plan qarzi bilan double-count yo'q.

**Sign / valyuta:** `> 0` = qarz (qizil), `< 0` = kredit/oldindan to'lov (yashil), `0` = neytral. Valyuta UZS (yagona).

### Edge holatlar
- `patient_id IS NULL` tranzaksiya — hech bir bemorga tegishli emas, chiqariladi.
- Bemorda reja/tranzaksiya yo'q → balans `0`.
- Overpay (`paidAmount > totalAmount` yoki allocation negatsiya ortig'i) → manfiy balans (kredit), to'g'ri ko'rsatiladi.

## 1. Backend (yondashuv A — service aggregate + sof helper)

Mavjud `cashier.billing.ts` pretsedentini takrorlaydi. `patients` moduli 4-faylli (alohida repository yo'q) — shu pattern saqlanadi.

### 1.1 `patients.balance.ts` (yangi, sof funksiya)
```ts
export type PatientBalanceInput = {
  stageCostSum: number;      // Σ stage.cost (qualifying plans)
  allocationSum: number;     // Σ allocation.amount (shu stage'lar)
  nonPlanRemainder: number;  // Σ (totalAmount − paidAmount), plansiz payment
};
export type PatientBalance = { balance: number; planDebt: number; nonPlanBalance: number };

export function computePatientBalance(input: PatientBalanceInput): PatientBalance;
```
- `planDebt = stageCostSum − allocationSum`; `nonPlanBalance = nonPlanRemainder`; `balance = planDebt + nonPlanBalance`.
- **Vitest unit** (`patients.balance.test.ts`): bo'sh (0), faqat plan qarzi, qisman to'lov, refund-negatsiya tiklanishi, kredit (overpay), faqat plansiz, ikkalasi aralash, multi-plan.

### 1.2 `patients.service.ts`
- **`balanceFor(c, patientId)`** — `getDb(c)` orqali 3 aggregate query (stage.cost yig'indisi qualifying plan'lar; allocation yig'indisi shu stage'lar; nonPlan remainder), so'ng `computePatientBalance` → `PatientBalance`. RLS tx-bound — explicit `WHERE tenant_id` YOZILMAYDI.
- **`list`** — mavjud `db.select().from(patients)` ga 3 ta **`LEFT JOIN` aggregate subquery** (har biri `patient_id` bo'yicha guruhlangan, mustaqil — fan-out/N+1 yo'q), har rowga `balance` qo'shadi. Pagination/filter o'zgarmaydi.

### 1.3 `patients.schema.ts`
- List item response'ga `balance: number`.
- Balance response: `{ balance: number, planDebt: number, nonPlanBalance: number }`.

### 1.4 `patients.routes.ts` (plain Hono — mavjud uslub)
- Yangi: `GET /:id/balance` `requirePermission('patient.view')` → `service.balanceFor`.
- Mavjud `GET /` list javobida har bemor `balance` bilan keladi.
- **To'lovlar tarixi uchun yangi endpoint YO'Q** — mavjud `GET /api/cashier/transactions?patientId=` filtri (cashier.service.list, allaqachon bor) qayta ishlatiladi.

## 2. api-client (qo'lda — auto-gen EMAS)

`packages/api-client` qo'lda yuritiladi (`endpoints.ts` + `types-*.ts`; OpenAPI pipeline CLI-92'gacha yo'q).
- `types-patients.ts`: patient list item + detail tipiga `balance` (+ kerakli joyda); yangi `PatientBalance` tipi.
- `endpoints.ts`: `api.patients.balance(id)` → `{ balance, planDebt, nonPlanBalance }`.

## 3. Frontend (`features/patients`, `features/cashier` — RFC-0010)

### 3.1 Shared balans primitivlari (LIST/CARD/CASHIER bo'lishishadi)
- `patients.api.ts`: `useBalance(id)` hook (`patientKeys.balance(id)`).
- `patients.mappers.ts`: balans view-model helper — son → `{ amount, kind: 'debt'|'credit'|'zero', color }` + i18n label. List-item va detail mapper'ga `balance` ulanadi.
- `apps/web/src/components` (app-shared): `BalanceText`/`BalanceBadge` prezentatsion komponent (qarz qizil, kredit yashil, formatlangan UZS).

### 3.2 Iste'molchi ekranlar
- **Patients list**: Balans ustuni (list `balance` + `BalanceBadge`).
- **Patient card**: header/Umumiy'da balans (`useBalance` + `BalanceBadge`); **To'lovlar tab** — `features/cashier` list'ni `patientId` filtri bilan.
- **Kassa**: yangi tranzaksiya oldidan "eski balans" carry-forward (`useBalance` + `BalanceBadge`).

## 4. Parallel-agent topologiya (build plan uchun)

Maqsad: maksimal parallel, minimal shared-fayl konflikt. Har agent **alohida worktree**'da.

```
Wave A (parallel, bog'liqlik yo'q)
  ├─ A1 Backend slice (1 agent): balance.ts(+test) → service → schema → routes
  │     [ichki ketma-ket, lekin bitta agent/worktree; verify: typecheck+vitest+check:rls]
  └─ A2 Docs (1 agent): RFC-0005 yangilash + Qaror #13 (Obsidian) + CLAUDE.md pointer
        [kod bilan kesishmaydi]

── Barrier: A1 merge ──

Wave B (1 qadam): api-client qo'lda kengaytirish
  └─ endpoints.ts + types-patients.ts (balance maydoni + balance endpoint)

── Barrier: B merge ──

Wave C (1 qadam): shared frontend primitivlar
  └─ useBalance hook + balance mapper (list+detail) + BalanceBadge komponent
        [LIST/CARD bir xil faylga yozmasligi uchun OLDIN bajariladi]

── Barrier: C merge ──

Wave D (parallel — fayl-izolyatsiya qilingan)
  ├─ D1 LIST: patients list jadvaliga Balans ustuni
  ├─ D2 CARD: bemor kartasi header balans + To'lovlar tab
  └─ D3 CASHIER: kassa "eski balans" carry-forward
```

**Konflikt oldini olish:** shared hook/mapper/komponent **Wave C**'da bir marta yaratiladi; D1/D2/D3 faqat o'z ekran komponentlariga tegadi (har xil fayl). A2 docs A1'ga parallel (kod kesishmaydi). Barrier'lar — api-client (B) backend (A1) tugamaguncha, frontend (C/D) api-client (B) tugamaguncha boshlanmaydi.

> Eslatma: parallelizm to'lqin ichida (A1∥A2, D1∥D2∥D3). To'lqinlar orasida barrier bor (tip kontrakti oqimi). Bu CLI-67 ning tabiiy bog'liqlik tuzilishi — sun'iy parallel kiritilmaydi.

## 5. Test + Verifikatsiya

- `patients.balance.test.ts` — sof helper (TDD, §1.1 holatlar).
- `bun --filter @dental/api typecheck` + `bun --filter @dental/api-client typecheck` + `bun --filter @dental/web typecheck`.
- `vitest` (helper) + `check:rls` (yangi query base jadvallari allaqachon FORCE RLS).
- Dev fidelity (inson): list balans ustuni; card balans + To'lovlar tab; kassa carry-forward; refund balansni tiklashi; draft reja qarz ko'rsatmasligi.

## 6. RFC-0005 yangilash

RFC-0005 **plan-inclusive** modelga yangilanadi:
- Formula: `planDebt + nonPlanBalance` (eski "faqat cashier SUM" superseded — Qaror #11 billing poydevori bilan uyg'un).
- Refund: void + manfiy allocation orqali (alohida ayirish emas).
- Status filtri: `accepted/in_progress/completed`; `draft/presented/cancelled` chiqariladi.
- `01-Qarorlar.md`'ga **Qaror #13** (R3 bemor balansi plan-inclusive) qo'shiladi; CLAUDE.md R3 progress pointer yangilanadi.

## Ochiq mayda nuqtalar (plan'da hal qilinadi)
- `balanceFor` 3 aggregate'ni bitta round-trip'ga birlashtirish (CTE) ixtiyoriy optimizatsiya — klinika masshtabida shart emas.
- Plan-linked tranzaksiyada `treatment_plan_id` bor, lekin allocation yo'q bo'lsa (faqat plan biriktirilgan, bosqichga taqsimlanmagan) — nonPlan'dan ham, planDebt'dan ham tushib qoladimi? Plan: plan-linked tranzaksiyalar har doim allocation orqali hisobga olinadi deb qabul qilinadi; `treatment_plan_id` bor + allocation yo'q holat kassa oqimida yuzaga kelmaydi (plan to'lovi = allocation). Plan'da edge test bilan tasdiqlanadi.
