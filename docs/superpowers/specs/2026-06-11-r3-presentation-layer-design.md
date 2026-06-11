# R3 yakuni — Prezentatsiya qatlami: Design Spec (CLI-66/69/70/21)

- **Sana:** 2026-06-11
- **Epik:** R3 / Linear CLI-65 ostidagi qolgan 4 task — **CLI-21** (rol landing), **CLI-66** (6 rol dashboard'i), **CLI-69** (reports ekran+eksport), **CLI-70** (audit-log o'qish)
- **Bog'liq:** [ux-ia-concept §2–4](../ux-ia-concept.md), RFC-0004 (shell), RFC-0006 (reports — main'da), CLI-67 balans + CLI-68 reports (main'da)
- **Status:** Approved (brainstorm), spec → plan'ga tayyor
- **Branch:** `feat/r3-presentation` (main'dan)

## Maqsad

R3 ning prezentatsiya qatlamini yakunlash va R3 ni yopish: rol identifikatori (backend), 6 rol dashboard'i, reports kutubxonasi ekrani + eksport, audit-log o'qish. Balans (CLI-67) + reports (CLI-68) backend hooks main'da — bu qatlam ularni iste'mol qiladi.

## Bog'liqlik va to'lqinlar

CLI-70/69/66 o'zaro mustaqil. CLI-21 **dashboard'lar (CLI-66) + rol-key (backend)**ga bog'liq → oxirgi.

```
Wave 1 (backend ∥): CLI-21-bk (templateKey + JWT roleKey + seed + migration) ∥ CLI-70-bk (audit read endpoint) ∥ docs
── barrier: api-client (roleKey claim tipi + audit + reports allaqachon) ──
Wave 2 (frontend ∥): CLI-66 dashboard'lar ∥ CLI-69 reports ekran+eksport ∥ CLI-70 audit UI
── barrier ──
Wave 3: CLI-21 landing routing (DashboardRouter — roleKey→dashboard)
```

---

## A. CLI-21 backend — rol identifikatori

### A.1 Schema (migration)
- `roles.templateKey TEXT NULL` — system template'lar uchun barqaror key. Index shart emas (kichik jadval).
- Seed (`packages/core/role-templates.ts` + `auth.service` template seed) har template'ga `templateKey`:
  | Template nomi | templateKey | Dashboard |
  |---|---|---|
  | Tenant Admin | `tenant_admin` | Menejer |
  | Branch Manager | `branch_manager` | Menejer |
  | Doctor | `doctor` | Doktor |
  | Doctor + Assistant | `doctor_assistant` | Doktor |
  | Nurse | `nurse` | Asistent |
  | Receptionist | `receptionist` | Registrator |
  | Accountant | `accountant` | Buxgalter |
  | Technician | `technician` | Texnik |
- Mavjud dev tenant rollarini nom bo'yicha backfill (migration data step yoki seed re-run — pre-launch, real tenant yo'q).

### A.2 JWT `AccessClaims`
- `roleKey: string | null` qo'shiladi (aktiv (tenant,branch) kontekstdagi **birlamchi** rol templateKey'i — birinchi assignment). Owner → `null` (frontend `@owner` perm orqali aniqlaydi).
- Claims quruvchi joy (workspace switch / login) `user_assignments → roles.templateKey` ni o'qiydi.
- Frontend auth store `roleKey` ni saqlaydi (`setContext` kengaytiriladi).

## B. CLI-70 — audit-log o'qish

### B.1 Backend — `audit` moduli
- `apps/api/src/modules/audit/` (routes + service + schema). `GET /api/audit` `requirePermission('audit_log.view')`.
- Params: `from?`, `to?`, `action?`, `resourceType?`, `userId?`, `page`, `pageSize`. RLS-scoped (`getDb(c)`); `audit_log` jadvalidan `created_at desc`, paginatsiya (`{ data, meta }`).
- Sof helper kerak emas (filtered list); audit yozilmaydi (o'qish endpointi o'zini log qilmaydi — yoki `audit_log.view` action sifatida yoziladi? — **yozilmaydi**, infinite-loop/shovqin oldini olish).
- Ustunlar: `id, userId, action, resourceType, resourceId, before, after, ip, userAgent, createdAt`.

### B.2 UI — `/audit` sahifa
- `features/audit/` — filtr paneli (sana/action/resourceType/user) + jadval (when/who/action/resource/diff). `before/after` JSON — kengaytiriladigan ko'rinish (detail modal yoki accordion). nav.audit mavjud, `audit_log.view` bilan gated.

## C. CLI-66 — 6 rol dashboard'i

### C.1 Shared widget'lar
`features/dashboard/components/widgets/`: `StatCard` (KPI raqam+label+trend), `MiniList` (kichik ro'yxat, har element link), `BarMini` (oddiy bar — Mantine yoki sof div; og'ir grafik kutubxona YO'Q v1). Faqat mavjud `BalanceBadge`/`Mono`/Mantine primitivlari.

### C.2 `features/dashboard/`
- `dashboard.api.ts` — reports/appointments/queue/lab/balance hooks wrapper (mavjud api-client + feature hooks'dan).
- Per-rol komponent (ux-ia §4 tarkibi, faqat mavjud API):
  | Rol | Widget'lar (mavjud manba) |
  |---|---|
  | **Registrator** | bugungi appointments (appointments list, today) + navbat (queue) + StatCard'lar (bugun: jami/kutilmoqda/no-show — appointmentStats today) |
  | **Doktor** | bugungi appointments (doctorId=joriy user) + MiniList (tugallanmagan — kerak bo'lsa defer/placeholder) |
  | **Menejer** | KPI StatCard'lar (reports.revenue/appointments/doctors/treatmentPlans) + BarMini (byBranch/byService) |
  | **Buxgalter** | moliya StatCard (revenue total/byPeriod) + kunlik kassa (dailySummary) |
  | **Asistent** | bugungi appointments (jadval) + vazifalar placeholder (modellanmagan — yengil) |
  | **Texnik** | lab navbati (lab-orders list, status/deadline) |
- `DashboardRouter` (CLI-21'da ulanadi) — `roleKey`/`@owner` → komponent; noma'lum → `GenericDashboard` (joriy `DashboardPage` mazmuni).

### C.3 Eslatma
Modellanmagan ma'lumot (asistent "vazifalar", doktor "imzolanmagan yozuvlar" agregati yo'q bo'lsa) → yengil placeholder yoki mavjud ro'yxatdan. Yangi backend endpoint qo'shilmaydi (YAGNI) — agar zarur bo'lsa reports'ga qo'shiladi, alohida qayd etiladi.

## D. CLI-69 — reports kutubxonasi ekrani + eksport

### D.1 `features/reports/` (frontend)
- `/reports` sahifa (`report.view` gated, nav.reports mavjud): sana-oralig'i (default oxirgi 30 kun) + filial filtri (Owner/Menejer — barcha; aks holda yashirin/joriy filial).
- Har metrika bo'limi: **revenue** (total + byBranch/byService/byDoctor jadval + byPeriod BarMini), **appointments** (no-show%, slot util%, byStatus), **doctors** (workload jadval), **plan-completion** (rate + byStatus). `reports.*` hooks (api-client main'da).

### D.2 Eksport
- **SheetJS `xlsx`** (apps/web dependency) — har hisobotni **CSV + xlsx** yuklab olish.
- Sof `toRows(report)` mapper'lar (`reports.export.ts`) — har report → `string[][]` (header + rows). **Unit-test** (eng muhim mantiq; SheetJS chaqiruvi yupqa wrapper).
- Eksport tugmasi har bo'limda (CSV / Excel).

## E. CLI-21 frontend — landing routing

- `DASHBOARD_BY_ROLE: Record<templateKey, DashboardComponent>` map (C.2).
- `/` route → `DashboardRouter`: `@owner` perm → Menejer; `roleKey` map'da bo'lsa → mos dashboard; aks holda → `GenericDashboard`.
- nav-config rolga moslashuvi allaqachon perms-filtered (qo'shimcha shart emas).
- auth store `roleKey` (A.2) ishlatiladi.

## api-client (qo'lda)
- `AccessClaims`/auth response tipiga `roleKey` (agar api-client auth tiplari bo'lsa; aks holda faqat web auth store).
- Yangi `audit` bloki — `api.audit.list(params)` + `AuditLogEntry`/`AuditListResponse` tip.
- reports endpointlar allaqachon main'da.

## Test + Verifikatsiya
- **Backend:** audit endpoint integration test (real DB seed + filtered list + RLS); templateKey seed smoke (yangi tenant rollari key bilan); JWT roleKey — auth flow integration yoki unit.
- **Frontend:** widget/mapper unit; `reports.export.toRows` unit; `DashboardRouter` (roleKey→komponent) test; audit/reports ekran smoke.
- `bun --filter @dental/api typecheck` + `@dental/api-client` + `@dental/web typecheck` + api/web suite + `check:rls` (audit_log policy mavjudligini tasdiqlash).

## Ochiq mayda nuqtalar (plan'da)
- `audit_log` RLS policy — `tenantId` nullable (platform event); read endpoint faqat tenant-scoped ko'rsatadi (null tenant chiqadi). Mavjud policy tekshiriladi.
- SheetJS `xlsx` versiya/import (`xlsx` npm) — plan'da o'rnatish + tree-shake.
- Doktor dashboard "tugallanmagan ishlar" agregati — mavjud bo'lmasa placeholder yoki appointments today'dan; alohida endpoint qo'shilmaydi.
- `templateKey` mavjud dev tenant backfill — migration data step yoki qo'lda seed re-run.
- JWT claims kengayishi — eski tokenlar `roleKey` siz (15 daq staleness, CLAUDE.md §7); frontend `roleKey` undefined → GenericDashboard fallback.
