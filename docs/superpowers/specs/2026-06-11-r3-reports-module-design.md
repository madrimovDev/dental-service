# R3 — Reports / agregatsiya moduli (query-time KPI): Design Spec

- **Sana:** 2026-06-11
- **Epik:** R3 / Linear **CLI-68** (M6 — R3 Ko'ndalang qatlam, parent CLI-65)
- **Bog'liq:** [RFC-0006](../../rfcs/0006-reporting-aggregation.md) (arxitektura), [RFC-0009](../../rfcs/0009-backend-module-architecture.md), CLI-67 balans spec (pretsedent), `cashier.dailySummary` (mavjud)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r3-reports` (main'dan, CLI-67 merge qilingach)

## Maqsad

Rol dashboard'lari (CLI-66) + reports ekrani (CLI-69) iste'mol qiladigan **agregatsiya/KPI qatlami** — backend-only. Query-time `GROUP BY` mavjud indekslangan jadvallar ustidan (RFC-0006: precompute YO'Q, cache faqat o'lchangan ehtiyojda). Tenant-scoped (RLS). UI bu spec'da YO'Q.

## Qamrov

**Ichida:** yangi `reports` moduli — `revenue` (davr/filial/xizmat/doktor), `appointmentStats` (no-show% + slot bandligi% + status breakdown), `doctorWorkload`, `planCompletion`; sof agregatsiya helperlari; endpointlar; integration test.

**Tashqarida:** kunlik kassa (mavjud `cashier/daily-summary` qayta ishlatiladi); rol dashboard UI (CLI-66); reports ekrani + eksport (CLI-69); Redis cache (o'lchangan ehtiyojda, hozir yo'q); rol-asosli branch majburlash (param sifatida, majburlash keyin).

## 1. Modul strukturasi (`apps/api/src/modules/reports/`)

```
reports/
├── reports.aggregations.ts   # SOF helperlar (arifmetika) — vitest unit
├── reports.aggregations.test.ts
├── reports.service.ts        # factory; metrika query'lari, getDb(c) (RLS, query-time GROUP BY)
├── reports.schema.ts         # Zod params + response DTO
├── reports.routes.ts         # endpointlar, requirePermission('report.view')
└── index.ts                  # routes factory eksport
```

- Audit YO'Q (agregat, PII emas).
- Kun chegarasi **Asia/Tashkent (+05:00)** — `cashier.dailySummary` bilan izchil (`new Date(\`${dateStr}T00:00:00+05:00\`)`).
- `report.view` permission mavjud (`packages/core/src/permissions.ts:297`).
- Routes app `main` da mount qilinadi (`/api/reports`).

## 2. Sof helperlar — `reports.aggregations.ts` (testlanadigan yadro)

```ts
/** No-show foizi (0..1). total=0 → 0. */
export function noShowRate(noShow: number, total: number): number;

/** Bandlik foizi (0..1). capacity=0 → 0; booked>capacity → 1 ga cheklanadi. */
export function utilizationPct(bookedMinutes: number, capacityMinutes: number): number;

/** Tugallanish foizi (0..1). total=0 → 0. */
export function completionRate(completed: number, total: number): number;

/** Branch ish-daqiqasi: workHours[weekday] {open,close} → daqiqa; null/yo'q → defaultMinutes. */
export function branchOpenMinutes(
  workHours: Record<string, { open: string; close: string } | null> | null,
  weekday: string,
  defaultMinutes: number,
): number;
```

**DEFAULT_WORK_MINUTES = 540** (09:00–18:00). `branchOpenMinutes`: `open`/`close` `"HH:MM"` → daqiqalar farqi; null kun → 0 (yopiq); butun `workHours` null → `defaultMinutes`.

**Unit testlar:** 0-division (no-show/util/completion → 0), util clamp (booked>capacity → 1), `branchOpenMinutes` (normal, null kun → 0, null workHours → default, `"09:00"–"18:00"` → 540).

## 3. Metrikalar (service) + endpointlar

Har endpoint: `from` (ISO date), `to` (ISO date), ixtiyoriy `branchId`. RLS tenant orqali — explicit `WHERE tenant_id` YOZILMAYDI.

### 3.1 `GET /api/reports/revenue` → `revenue(c, params)`
```
total      = Σ(paidAmount | type=payment, status=completed) − Σ(paidAmount | type=refund, status=completed)
byBranch[] = GROUP BY branchId → { branchId, total }
byService[]= cashier_transaction_items JOIN tx (payment, completed) → GROUP BY serviceName → { serviceName, total: Σ subtotal }
byDoctor[] = plan-linked tx (treatment_plan_id NOT NULL) JOIN treatment_plans → GROUP BY doctorId → { doctorId, total: Σ paidAmount };
             plansiz (treatment_plan_id IS NULL) → { doctorId: null (Belgilanmagan), total }
byPeriod[] = GROUP BY kun (Tashkent) → { date, total }  (payment − refund)
```
`branchId` berilsa — barcha breakdown shu filialga filtrlanadi. Sana oralig'i `created_at` bo'yicha.

### 3.2 `GET /api/reports/appointments` → `appointmentStats(c, params)`
```
byStatus  = GROUP BY status → count (scheduled/confirmed?/completed/no_show/cancelled)
total     = Σ count
noShowRate= noShowRate(no_show, total)
slotUtilization = utilizationPct(bookedMinutes, capacityMinutes), bunda:
   bookedMinutes  = Σ (end_time − start_time) daqiqa | status ≠ cancelled (oraliqda, [branch]) — bron qilingan slotlar (no_show ham band qilgan)
   capacityMinutes= Σ_kun Σ_branch [ branchOpenMinutes(branch.workHours, weekday, 540) × distinctDoctorCount ]
   distinctDoctorCount = oraliqda [branch]da ≥1 appointment'ga ega distinct doctor_id soni
```
> Capacity proxy: real "ish o'rni/stul" modeli yo'q — band bo'lgan distinct doktor soni × branch ish-daqiqasi. Spec'da caveat sifatida.

### 3.3 `GET /api/reports/doctors` → `doctorWorkload(c, params)`
```
[] = appointments GROUP BY doctorId → { doctorId, total, completed }  (oraliqda, [branch])
```

### 3.4 `GET /api/reports/treatment-plans` → `planCompletion(c, params)`
```
status ∈ {accepted, in_progress, completed} rejalar bosqichlari (treatment_stages):
totalStages     = count
completedStages = count(status=completed)
rate            = completionRate(completedStages, totalStages)
byStatus[]      = stage status breakdown (pending/in_progress/completed/skipped)
```
> Sana oralig'i ixtiyoriy: rejaning `created_at` bo'yicha (yoki oraliqsiz — barcha aktiv rejalar). Plan'da aniqlanadi: default = oraliqsiz (joriy holat), `from`/`to` berilsa reja `created_at` bo'yicha filtr.

### 3.5 Kunlik kassa — qayta ishlatiladi
Mavjud `GET /api/cashier/daily-summary` o'zgartirilmaydi. Reports moduli uni dublirlamaydi; dashboard/reports ekrani ikkalasini chaqiradi.

## 4. Schema (`reports.schema.ts`)
- `reportRangeSchema = z.object({ from: z.iso.date(), to: z.iso.date(), branchId: z.uuid().optional() })`.
- Response DTO'lar: `RevenueReport`, `AppointmentStatsReport`, `DoctorWorkloadRow[]`, `PlanCompletionReport` (yuqoridagi shakllar).

## 5. api-client (qo'lda — CLI-67 kabi)
- `packages/api-client`: yangi `reports` bloki — `revenue`, `appointments`, `doctors`, `treatmentPlans` (har biri `(params) => api.get<...>(...)`), querystring `from/to/branchId`.
- Yangi tiplar (`types-reports.ts` yoki mavjud faylga): `RevenueReport`, `AppointmentStatsReport`, `DoctorWorkloadRow`, `PlanCompletionReport`.

## 6. Caveat'lar (hujjatlanadi — RFC-0006 + kod kommenti)
- `byService` faqat **itemli POS** sotuvni qamraydi — plan-billing tranzaksiyalarida `_items` bo'sh, demak plan tushumi xizmatlarga taqsimlanmaydi.
- `revenueByDoctor` faqat **plan-linked** tushumni doktorga bog'laydi; plansiz (walk-in) → "Belgilanmagan".
- `slotUtilization` **ish-vaqti taxminiga** (branch.workHours yoki default 540 daqiqa) va distinct-doktor capacity proxy'siga tayanadi — taxminiy ko'rsatkich.

## 7. Test + Verifikatsiya
- `reports.aggregations.test.ts` — sof helper unit (TDD).
- **Integration test** (real DB, CLI-67 patternida MAJBURIY — SQL'ni ishga tushiradi): seed (2 doktor, branch workHours, appointment'lar [scheduled/completed/no_show/cancelled], cashier tx [payment/refund, plan-linked + plansiz, items], treatment_stages [completed/pending]) → har metrika kutilgan qiymat; soxta `Context` (`c.get('db')=tx`), `service.<metrika>(ctx(tx), params)`.
- `bun --filter @dental/api typecheck` + `@dental/api-client typecheck` + vitest + `check:rls` + api suite.

## 8. Parallel-agent topologiya
```
Wave A (parallel)
  ├─ A1 Backend (1 agent): aggregations(+test) → schema → service → routes → main mount → integration test
  └─ A2 Docs (1 agent): RFC-0006 status "implemented" + 3 caveat; CLAUDE.md R3 progress
── Barrier: A1 merge ──
Wave B (1 qadam): api-client (reports bloki + tiplar)
```
Frontend yo'q (CLI-68 backend-only). A2 docs A1'ga parallel (kod kesishmaydi).

## Ochiq mayda nuqtalar (plan'da hal qilinadi)
- `planCompletion` sana filtri default (oraliqsiz vs reja created_at) — plan'da qotiriladi.
- Rol-asosli branch majburlash (Branch Manager → o'z filiali) — hozir param; keyingi refinement (eslatma).
