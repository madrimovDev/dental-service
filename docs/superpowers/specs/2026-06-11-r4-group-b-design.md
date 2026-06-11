# R4 Guruh B — Xodim profili + Payroll: Design Spec (CLI-72/77)

- **Sana:** 2026-06-11
- **Epik:** R4 / Linear CLI-71 (M7) ning 2-guruhi — **CLI-72** (xodim profili), **CLI-77** (payroll)
- **Bog'liq:** RFC-0007 (ERP data model), RFC-0009, RFC-0006 (revenue attribution — byDoctor), CLI-68 reports (pretsedent)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r4-group-b` (main'dan, Guruh A merge qilingach)

## Maqsad

R4 ning 2-guruhi: xodim employment profili (mutaxassislik, status, ish-sana, baza oylik, komissiya%) + payroll (gibrid baza+komissiya, snapshot run). Payroll xodim profilini va plan-linked daromad-attribusiyani iste'mol qiladi.

## Asosiy qarorlar (brainstorm)
- **Kompensatsiya:** gibrid — `baseSalary + commissionPercent × attributedRevenue` (ikkalasi 0 bo'lishi mumkin).
- **Daromad-attribusiya:** plan-linked to'langan daromad (doktor treatment_plan'lariga bog'langan, davrda). Plansiz/walk-in komissiyaga kirmaydi (caveat).
- **Payroll = snapshot** (moliyaviy yozuv, hisobot kabi computed emas) — run yaratilganda hisoblanadi va `payroll_lines`'ga qotiriladi.
- **Xodim profili = yangi `staff_profiles`** (per tenant+user; user_assignments per-branch/role, mos emas).

## 1. Schema (3 yangi jadval, RLS)

### `staff_profiles`
```
staff_profiles
├── id uuid pk
├── tenant_id uuid NOT NULL → tenants (cascade)
├── user_id uuid NOT NULL → users (cascade)
├── specialty text?
├── employment_status enum('active','on_leave','inactive') default 'active'
├── started_at date?
├── base_salary numeric(14,2) NOT NULL default 0
├── commission_percent numeric(5,2) NOT NULL default 0
├── created_at, updated_at timestamptz
└── UNIQUE (tenant_id, user_id)
```

### `payroll_runs`
```
payroll_runs
├── id uuid pk
├── tenant_id uuid NOT NULL → tenants
├── period_from date NOT NULL
├── period_to date NOT NULL
├── status enum('draft','finalized') default 'draft'
├── created_by uuid? → users (set null)
└── created_at timestamptz
```

### `payroll_lines` (snapshot)
```
payroll_lines
├── id uuid pk
├── tenant_id uuid NOT NULL → tenants
├── run_id uuid NOT NULL → payroll_runs (cascade)
├── user_id uuid NOT NULL → users (set null? — snapshot saqlanadi)
├── base_salary numeric(14,2) NOT NULL          # snapshot
├── attributed_revenue numeric(14,2) NOT NULL    # snapshot
├── commission_percent numeric(5,2) NOT NULL     # snapshot
├── commission_amount numeric(14,2) NOT NULL
├── total numeric(14,2) NOT NULL
└── created_at timestamptz
```
Index: `payroll_lines(tenant_id, run_id)`. RLS uchchaviga (`migrations/rls/0009_r4_group_b_rls.sql`).

## 2. Xodim profili (CLI-72) — users sub-resurs

### Backend
- `GET /api/users/:userId/profile` (`user.view`) → `staff_profiles` row (yo'q bo'lsa null/default).
- `PUT /api/users/:userId/profile` (`user.manage`) — upsert (`ON CONFLICT (tenant_id, user_id)`), audit.
- users moduliga qo'shiladi (yangi alohida modul emas).

### UI
- Xodimlar sozlamasi ekranida (`features/settings` users) — xodim qatoridan profil tahrirlash (modal/panel): mutaxassislik, status, ish-sana, baza oylik, komissiya%. zod4Resolver.

## 3. Payroll (CLI-77)

### Backend — `payroll` moduli
- **Sof helper** `payroll.calc.ts`: `computePayrollLine(baseSalary, attributedRevenue, commissionPercent)` → `{ commissionAmount, total }` (`commissionAmount = attributedRevenue × commissionPercent / 100`; `total = baseSalary + commissionAmount`). Unit test: 0-komissiya, 0-baza, aralash, yaxlitlash (2 kasr).
- **`createRun(c, {periodFrom, periodTo})`** — bir tx:
  1. `payroll_runs` insert (draft).
  2. Aktiv `staff_profiles` (employment_status='active') o'qiladi.
  3. Davrda plan-linked attributed daromad GROUP BY doctorId: `Σ(paidAmount, payment) − Σ(paidAmount, refund)` `cashier_transactions` plan-linked (`treatment_plan_id NOT NULL`) JOIN `treatment_plans` `doctorId`, `created_at` davrda, completed. (payroll o'z query'si — reports import yo'q.)
  4. Har profil uchun `computePayrollLine(base, attributedRevenue[userId] ?? 0, commission%)` → `payroll_lines` insert (snapshot).
- `listRuns(c)`, `getRun(c, runId)` (+lines), `finalizeRun(c, runId)` (status→finalized). Permission `payroll.view`/`payroll.manage`.
- Audit run yaratish/finalize.

### UI — `features/payroll/`
- `/payroll`: davr tanlash + "Run yaratish" + run ro'yxati + run detali (jadval: xodim / baza / attributed daromad / komissiya% / komissiya / jami) + finalize tugma. zod4Resolver (period). Permission `payroll.view`.

## 4. api-client (qo'lda)
- `types-erp.ts` (yoki yangi `types-hr.ts`): `StaffProfile`, `PayrollRun`, `PayrollLine`, `PayrollRunWithLines`.
- Endpoint: `users.profile.get/put`; `payroll.{runs, getRun, createRun, finalize}`.

## 5. Bog'liqlik + parallel topologiya
Payroll `staff_profiles` jadvalini o'qiydi (foundation'da bor) — profil MODULIga bog'liq emas → parallel.
```
Wave 1 (poydevor, 1 agent): schema (3 jadval) + RLS + permissions (payroll.*) + migration generate (apply orkestrator)
  ── barrier: migration apply ──
Wave 2 (backend ∥): xodim profili (users sub-resurs) ∥ payroll (calc+service+routes+integration) ∥ docs
  ── barrier: api-client ──
Wave 3 (frontend ∥): xodim profili UI ∥ payroll UI
```
> Profil users moduliga, payroll yangi modul + app.ts mount (mount orkestrator). DB-test orkestrator ketma-ket.

## 6. Test + Verifikatsiya
- Sof helper `payroll.calc` unit.
- **Integration (real DB, MAJBURIY):** staff profil upsert; **payroll createRun** — profil (base + commission%) + plan-linked daromad seed (doctor=user) → attributedRevenue/commissionAmount/total to'g'ri, snapshot `payroll_lines` yoziladi; aktiv bo'lmagan profil chiqariladi.
- typecheck (api/api-client/web) + api/web suite + `check:rls` (3 yangi jadval).

## 7. Yangi permissions
`payroll.view`, `payroll.manage` — `permissions.ts` + role-templates (Accountant → payroll.view+manage; Tenant Admin + Branch Manager → payroll.*). Xodim profili — mavjud `user.view`/`user.manage`.

## Ochiq mayda nuqtalar (plan'da)
- `payroll_lines.userId` FK `set null` (xodim o'chsa snapshot qoladi) yoki cascade? Taklif: `set null` (moliyaviy snapshot saqlanadi). Plan'da qotiriladi.
- Bir davr uchun bir necha run (qayta hisoblash) — ruxsat (draft run'lar); finalize'dan keyin qayta yaratish yangi run. Duplikat guard yo'q (v1).
- Komissiya daromadi = `paidAmount` (to'langan) — `totalAmount` (charja) emas; brainstorm bo'yicha "to'langan daromad".
- Attribusiya faqat plan-linked — bu RFC-0006 byDoctor cheklovi bilan izchil; plansiz tushum komissiyaga kirmaydi (hujjatlanadi).
