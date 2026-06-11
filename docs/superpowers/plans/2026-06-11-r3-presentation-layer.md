# R3 Prezentatsiya qatlami — Implementation Plan (CLI-66/69/70/21)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development yoki superpowers:executing-plans. Steps checkbox (`- [ ]`) bilan.

**Goal:** R3 prezentatsiya qatlamini yakunlash — rol identifikatori (backend), audit-log o'qish, 6 rol dashboard'i, reports ekrani+eksport, rol landing.

**Architecture:** Wave 1 backend (roles.templateKey + JWT roleKey + audit endpoint) → api-client barrier → Wave 2 frontend (dashboards ∥ reports screen ∥ audit UI) → Wave 3 landing routing. Balans (CLI-67) + reports (CLI-68) main'da.

**Tech Stack:** Bun, Hono, Drizzle, Zod, Vitest; React 18, Mantine v7, TanStack Query, SheetJS `xlsx`.

**Spec:** [`docs/superpowers/specs/2026-06-11-r3-presentation-layer-design.md`](../specs/2026-06-11-r3-presentation-layer-design.md)

---

## Wave topologiya

| Wave | Tasklar | Parallel agentlar |
|---|---|---|
| **1 (backend)** | Task 1→2 (CLI-21-bk, 1 agent) ∥ Task 3 (CLI-70-bk, 1 agent) ∥ Task 4 (docs) | 3 |
| **barrier** | Task 5 (api-client) | 1 |
| **2 (frontend)** | Task 6→7 (CLI-66, 1 agent) ∥ Task 8 (CLI-69, 1 agent) ∥ Task 9 (CLI-70-UI, 1 agent) | 3 |
| **3** | Task 10 (CLI-21 landing) | 1 |

Verifikatsiya: `bun --filter @dental/api typecheck`, `@dental/api-client`, `@dental/web typecheck`; api test `cd apps/api && bun test --env-file=../../.env`; web test `bun --filter @dental/web test`; `bun run check:rls`. Parallel agentlar commit qilmaydi — orkestrator har wave'dan keyin verify+commit.

---

## Task 1: `roles.templateKey` + seed (CLI-21-bk a)

**Files:**
- Modify: `packages/db-schema/src/tables/roles.ts`
- Modify: `packages/core/src/role-templates.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts` (`seedSystemRolesInTx`)
- Migration: `drizzle-kit generate` natijasi

- [ ] **Step 1: Schema ustun**

`roles.ts` — `description` dan keyin:
```ts
    templateKey: text('template_key'), // system template barqaror key (custom rol → null)
```

- [ ] **Step 2: RoleTemplate type + key'lar**

`role-templates.ts` — type'ga `templateKey: string` qo'sh; har 8 template'ga key:
```ts
export type RoleTemplate = {
  name: string;
  templateKey: string;
  descriptionUz: string;
  descriptionRu: string;
  permissions: readonly Permission[];
};
```
Key'lar (har template `name`'iga mos `templateKey` qo'shiladi): Tenant Admin→`tenant_admin`, Branch Manager→`branch_manager`, Doctor→`doctor`, Doctor + Assistant→`doctor_assistant`, Nurse→`nurse`, Receptionist→`receptionist`, Accountant→`accountant`, Technician→`technician`.

- [ ] **Step 3: Seed insert'ga templateKey**

`auth.service.ts` `seedSystemRolesInTx` — roles insert qiladigan joyda `templateKey: tmpl.templateKey` qo'sh (template loop ichida). (Funksiyani o'qib, `.values({...})` ga qo'sh.)

- [ ] **Step 4: Migration generate**

Run: `bun --filter @dental/api drizzle:generate` (yoki `db:generate` — package.json'dan aniqla)
Expected: yangi migration `roles.template_key` qo'shadi. Review (faqat shu ustun).

- [ ] **Step 5: Dev tenant backfill** — migration SQL'ga yoki alohida: mavjud rollarni nom bo'yicha key'lash. Pre-launch dev data — agar migration data step qo'shib bo'lmasa, qo'lda `UPDATE roles SET template_key = ... WHERE name = ...` (8 qator) migration fayliga qo'shiladi. Plan agent: drizzle migration faylga shu UPDATE'larni qo'sh.

- [ ] **Step 6: Typecheck + check:rls** — `bun --filter @dental/api typecheck && bun run check:rls`.
- [ ] **Step 7: Commit (orkestrator).**

---

## Task 2: JWT `roleKey` claim + auth resolution + web store (CLI-21-bk b)

**Files:**
- Modify: `apps/api/src/lib/jwt.ts` (`AccessClaims`)
- Modify: `apps/api/src/modules/auth/auth.service.ts` (perms-building joylar — roleKey resolve)
- Modify: `apps/api/src/middleware/auth.ts` (claims → context, agar kerak)
- Modify: `apps/web/src/stores/auth-store.ts`

- [ ] **Step 1: AccessClaims'ga roleKey**

`jwt.ts` `AccessClaims` type'ga:
```ts
  roleKey: string | null; // aktiv kontekstdagi birlamchi rol templateKey'i (owner → null)
```

- [ ] **Step 2: roleKey resolve (auth.service)**

Perms aktiv kontekst uchun hisoblanadigan joy(lar)da (`switchWorkspace` ~496, `refresh` ~411) — assignment query'sida `roles.templateKey` ni ham olib, **birinchi** assignment templateKey'ini `roleKey` sifatida `signAccess({... roleKey})` ga uzat. Owner (assignment yo'q) → `roleKey: null`. No-context login (line 219) → `roleKey: null`.
(auth.service'dagi assignment→perms query'ni o'qib, `roles.templateKey` ni select'ga qo'sh va birinchisini ol.)

- [ ] **Step 3: middleware (agar context'ga kerak)** — `auth.ts` claims'ni context'ga qo'yganda `roleKey` ni ham (`c.set('roleKey', claims.roleKey)`) — agar backend hech kim ishlatmasa, o'tkazib yuboriladi (frontend JWT'dan oladi). Plan: backend ishlatmaydi → faqat frontend.

- [ ] **Step 4: web auth store**

`auth-store.ts` — `roleKey: string | null` state + `setContext` ga qo'sh. JWT decode qilingan joyda (login/switch response) `roleKey` saqlanadi. (Store'ni o'qib `permissions` qatoriga `roleKey` qo'sh.)

- [ ] **Step 5: Typecheck** — `bun --filter @dental/api typecheck && bun --filter @dental/web typecheck`.
- [ ] **Step 6: Commit (orkestrator).**

> Eslatma: roleKey JWT'da bo'lgani uchun frontend uni token'dan o'qiydi (auth store JWT parse qiladigan joyda). Agar auth store faqat `setContext(perms)` orqali kelsa — login/switch oqimida roleKey ham uzatiladi.

---

## Task 3: `audit` moduli — o'qish endpoint + integration test (CLI-70-bk)

**Files:**
- Create: `apps/api/src/modules/audit/{audit.schema.ts, audit.service.ts, audit.routes.ts, index.ts}`
- Modify: `apps/api/src/app.ts` (mount)
- Create: `apps/api/tests/integration/audit.test.ts`

- [ ] **Step 1: Schema**

`audit.schema.ts`:
```ts
import { z } from 'zod';
export const auditListQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  userId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
```

- [ ] **Step 2: Service**

`audit.service.ts` (factory, `getDb(c)`, RLS):
```ts
import { auditLog } from '@dental/db-schema';
import { and, between, count, desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { getDb } from '../../db/scoped.ts';
import type { AuditListQuery } from './audit.schema.ts';

export const createAuditService = () => {
  async function list(c: Context, q: AuditListQuery) {
    const db = getDb(c);
    const offset = (q.page - 1) * q.pageSize;
    const filters = [];
    if (q.action) filters.push(eq(auditLog.action, q.action));
    if (q.resourceType) filters.push(eq(auditLog.resourceType, q.resourceType));
    if (q.userId) filters.push(eq(auditLog.userId, q.userId));
    if (q.from && q.to) {
      filters.push(between(auditLog.createdAt, new Date(`${q.from}T00:00:00+05:00`), new Date(`${q.to}T23:59:59.999+05:00`)));
    }
    const where = filters.length ? and(...filters) : undefined;
    const [rows, totalRows] = await Promise.all([
      db.select().from(auditLog).where(where).orderBy(desc(auditLog.createdAt)).limit(q.pageSize).offset(offset),
      db.select({ total: count() }).from(auditLog).where(where),
    ]);
    return { data: rows, meta: { page: q.page, pageSize: q.pageSize, total: totalRows[0]?.total ?? 0 } };
  }
  return { list };
};
```

- [ ] **Step 3: Routes + index + mount**

`audit.routes.ts` (patients uslubi, `authMiddleware` + `rlsMiddleware(deps.db)`):
```ts
import { ok } from '@dental/core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Database } from '../../db/client.ts';
import { authMiddleware } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/require-permission.ts';
import { rlsMiddleware } from '../../middleware/rls.ts';
import { auditListQuerySchema } from './audit.schema.ts';
import { createAuditService } from './audit.service.ts';

export const auditRoutes = (deps: { db: Database }) => {
  const app = new Hono();
  app.use('*', authMiddleware());
  app.use('*', rlsMiddleware(deps.db));
  const service = createAuditService();
  app.get('/', requirePermission('audit_log.view'), async (c) => {
    const q = auditListQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!q.success) throw new HTTPException(400, { message: 'Invalid query' });
    return c.json(ok(await service.list(c, q.data)));
  });
  return app;
};
```
`index.ts`: `export { auditRoutes } from './audit.routes.ts';`
`app.ts`: import + `app.route('/api/audit', auditRoutes({ db }));`

- [ ] **Step 4: Integration test**

`apps/api/tests/integration/audit.test.ts` — CLI-67/68 patternida: tenant seed; `audit_log`'ga 2-3 row insert (RLS context ichida — `tenantId` set); soxta `Context`; `service.list(ctx(tx), {...})` → filtr (action/resourceType) ishlashini va RLS tenant-scope (boshqa tenant row ko'rinmasligi) ni tasdiqla.

> ⚠️ **`audit_log` RLS:** o'qishdan oldin `audit_log` jadvali FORCE RLS + policy borligini tasdiqla (`check:rls` 18 jadvalda bormi). Agar yo'q bo'lsa — bu alohida muammo; plan agent surface qilsin (read endpoint RLS'ga tayanadi). `tenantId` nullable (platform event) → tenant context'da null-tenant rowlar ko'rinmaydi (kutilgan).

- [ ] **Step 5: Verify** — `cd apps/api && bun test --env-file=../../.env audit && bun --filter @dental/api typecheck && bun run check:rls`.
- [ ] **Step 6: Commit (orkestrator).**

---

## Task 4: Docs (Wave 1 — parallel)

**Files:** Modify `CLAUDE.md` (R3 yakuni progress); `docs/ux-ia-concept.md` (agar §8 ochiq savol — "last-used vs primary role" → primary tanlandi, qisqa qayd).

- [ ] CLAUDE.md Progress: CLI-21/66/69/70 ish boshlandi/tugadi qaydi. Commit (orkestrator).

---

## Task 5: api-client (barrier — Wave 1 tugagach)

**Files:**
- Create: `packages/api-client/src/types-audit.ts`
- Modify: `packages/api-client/src/endpoints.ts`, `src/index.ts`
- Modify: auth tip (agar `roleKey` auth response tipida bo'lsa)

- [ ] **Step 1: Audit tiplar** (`types-audit.ts`):
```ts
export type AuditLogEntry = {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};
export type AuditListResponse = { data: AuditLogEntry[]; meta: { page: number; pageSize: number; total: number } };
```
- [ ] **Step 2: Endpoint** (`endpoints.ts`, yangi `audit` bloki):
```ts
  audit: {
    list: (q?: { from?: string; to?: string; action?: string; resourceType?: string; userId?: string; page?: number; pageSize?: number }) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(q ?? {})) if (v != null) p.set(k, String(v));
      const qs = p.toString();
      return api.get<AuditListResponse>(`/api/audit${qs ? `?${qs}` : ''}`);
    },
  },
```
import `AuditListResponse` + `index.ts` re-export `types-audit.ts`.
- [ ] **Step 3: roleKey** — agar auth login/switch response tipida `roleKey` qaytsa, mos tipga qo'sh (auth tiplari qayerda bo'lsa). Aks holda faqat web store JWT'dan oladi.
- [ ] **Step 4: Typecheck** (`api-client` + `web`) + **Commit (orkestrator).**

---

## Task 6: Shared dashboard widget'lar + hooks (CLI-66 a)

**Files:**
- Create: `apps/web/src/features/dashboard/components/widgets/{StatCard.tsx, MiniList.tsx, BarMini.tsx}`
- Create: `apps/web/src/features/dashboard/dashboard.api.ts`
- Test: `apps/web/src/features/dashboard/components/widgets/StatCard.test.tsx`

- [ ] **Step 1: Widget'lar** (Mantine primitivlari; og'ir grafik kutubxona YO'Q):
  - `StatCard({ label, value, hint?, color? })` — `Card` + `Text` (katta raqam) + label + ixtiyoriy hint. `formatUZS` kerak bo'lsa inline.
  - `MiniList({ title, items: {id,label,right?,to?}[], emptyText })` — `Card` + sarlavha + ro'yxat (link `to` bo'lsa `Link`).
  - `BarMini({ data: {label, value}[] })` — sof CSS bar (max'ga nisbatan `width %`), `Box`/`div`. Grafik dep yo'q.
- [ ] **Step 2: `dashboard.api.ts`** — mavjud hooks/api-client wrapper:
  - `useTodayRange()` → bugungi `from/to` (Tashkent).
  - `useManagerKpi(range)` → `useQuery` `api.reports.revenue/appointments/doctors/treatmentPlans` (parallel yoki alohida hooklar).
  - boshqa rollar uchun mavjud feature hooks qayta ishlatiladi (appointments list, queue, lab-orders, `useReports*`). Yangi backend endpoint YO'Q.
- [ ] **Step 3: StatCard test** (vitest, render + value ko'rinishi).
- [ ] **Step 4: Verify** (`bun --filter @dental/web typecheck && bun --filter @dental/web test StatCard`) + **Commit (orkestrator).**

---

## Task 7: 6 rol dashboard komponenti + DashboardRouter (CLI-66 b)

**Files:**
- Create: `apps/web/src/features/dashboard/components/{ManagerDashboard,ReceptionistDashboard,DoctorDashboard,AccountantDashboard,AssistantDashboard,TechnicianDashboard,GenericDashboard}.tsx`
- Create: `apps/web/src/features/dashboard/DashboardRouter.tsx`
- Create: `apps/web/src/features/dashboard/role-dashboard-map.ts`
- Test: `apps/web/src/features/dashboard/DashboardRouter.test.tsx`

- [ ] **Step 1: Per-rol komponent** — Task 6 widget'laridan kompozitsiya (spec §C.2 tarkibi, faqat mavjud API). Har biri `Container` + `Grid`/`Stack`:
  - **ManagerDashboard:** `useManagerKpi(today/period)` → StatCard'lar (revenue total, no-show%, slot util%, plan completion%) + BarMini (revenue byBranch/byService) + MiniList (top doctors workload).
  - **ReceptionistDashboard:** bugungi appointments (appointments feature hook, today) MiniList + queue MiniList + StatCard (bugun jami/no-show — appointmentStats today).
  - **DoctorDashboard:** bugungi appointments (doctorId=joriy user — auth user id) MiniList + StatCard (bugungi soni). "Tugallanmagan" → mavjud bo'lmasa qoldiriladi/placeholder.
  - **AccountantDashboard:** StatCard (revenue total/byPeriod) + dailySummary (cashier) MiniList.
  - **AssistantDashboard:** bugungi appointments jadval MiniList + "vazifalar" placeholder (modellanmagan — `Text c=dimmed`).
  - **TechnicianDashboard:** lab-orders MiniList (status/deadline).
  - **GenericDashboard:** joriy `pages/dashboard.page.tsx` mazmuni (fallback) — uni shu yerga ko'chir yoki qayta ishlat.
- [ ] **Step 2: role-dashboard-map.ts**
```ts
import type { ComponentType } from 'react';
// import dashboards...
export const DASHBOARD_BY_ROLE: Record<string, ComponentType> = {
  tenant_admin: ManagerDashboard,
  branch_manager: ManagerDashboard,
  doctor: DoctorDashboard,
  doctor_assistant: DoctorDashboard,
  nurse: AssistantDashboard,
  receptionist: ReceptionistDashboard,
  accountant: AccountantDashboard,
  technician: TechnicianDashboard,
};
```
- [ ] **Step 3: DashboardRouter** — auth store'dan `roleKey` + `permissions`:
```tsx
export function DashboardRouter() {
  const { roleKey, permissions } = useAuthStore();
  if (permissions.includes('@owner')) return <ManagerDashboard />;
  const Cmp = roleKey ? DASHBOARD_BY_ROLE[roleKey] : undefined;
  return Cmp ? <Cmp /> : <GenericDashboard />;
}
```
- [ ] **Step 4: DashboardRouter test** — roleKey='doctor' → DoctorDashboard; '@owner' → Manager; null/noma'lum → Generic (mock useAuthStore + feature hooks).
- [ ] **Step 5: Verify** (`typecheck` + `bun --filter @dental/web test DashboardRouter`) + **Commit (orkestrator).**

> ⚠️ Bu task `/` route'ni HALI o'zgartirmaydi (Task 10/Wave 3). Faqat komponentlar + router yaratiladi.

---

## Task 8: Reports ekrani + eksport (CLI-69)

**Files:**
- Create: `apps/web/src/features/reports/{reports.api.ts, reports.export.ts, reports.export.test.ts}`
- Create: `apps/web/src/features/reports/components/ReportsScreen.tsx` (+ sub-komponentlar kerak bo'lsa)
- Create: `apps/web/src/pages/reports.page.tsx`
- Modify: `apps/web/src/app/App.tsx` (route `/reports`), `apps/web/package.json` (xlsx dep)

- [ ] **Step 1: xlsx dep** — `apps/web`'ga `xlsx` (SheetJS) qo'sh: `bun add xlsx --filter @dental/web` (yoki package.json + install).
- [ ] **Step 2: reports.api.ts** — `useRevenueReport(range)`, `useAppointmentStats(range)`, `useDoctorWorkload(range)`, `usePlanCompletion(range)` → `api.reports.*` (main'da). query-key `['reports', name, range]`.
- [ ] **Step 3: reports.export.ts** — sof `toRows`:
```ts
import type { RevenueReport, AppointmentStatsReport, DoctorWorkloadRow, PlanCompletionReport } from '@dental/api-client';
export function revenueToRows(r: RevenueReport): string[][] { /* header + byBranch/byService/byDoctor/byPeriod qatorlar */ }
export function appointmentsToRows(r: AppointmentStatsReport): string[][] { ... }
export function doctorsToRows(rows: DoctorWorkloadRow[]): string[][] { ... }
export function planCompletionToRows(r: PlanCompletionReport): string[][] { ... }
```
+ yupqa `downloadCsv(rows, filename)` (Blob) va `downloadXlsx(rows, filename)` (SheetJS `utils.aoa_to_sheet` + `writeFile`).
- [ ] **Step 4: export test** — har `toRows` (header + qator soni + qiymat) unit (vitest). SheetJS chaqiruvi test qilinmaydi (yupqa wrapper).
- [ ] **Step 5: ReportsScreen** — sana-oralig'i (`@mantine/dates` agar bor; aks holda 2 date input) + filial filtri (branchId, Owner/Menejer); har metrika bo'limi (jadval + BarMini) + Eksport tugmalari (CSV/Excel) `toRows` + download. `pages/reports.page.tsx` yupqa entry; App.tsx `<Route path="/reports" element={rp('report.view', <ReportsPage/>)} />`.
- [ ] **Step 6: Verify** (`typecheck` + `bun --filter @dental/web test reports.export`) + **Commit (orkestrator).**

---

## Task 9: Audit UI (CLI-70-UI)

**Files:**
- Create: `apps/web/src/features/audit/{audit.api.ts, audit.mappers.ts}`, `components/AuditScreen.tsx`
- Create: `apps/web/src/pages/audit.page.tsx`
- Modify: `apps/web/src/app/App.tsx` (route `/audit`)

- [ ] **Step 1: audit.api.ts** — `useAuditLog(params)` → `api.audit.list` (Task 5). query-key `['audit', params]`.
- [ ] **Step 2: AuditScreen** — filtr (sana/action/resourceType/userId) + jadval (when/who/action/resource/resourceId). `before/after` JSON → detail modal yoki accordion (`Code`/`JsonInput readOnly`). Sahifalash (meta).
- [ ] **Step 3: route** — `pages/audit.page.tsx` + App.tsx `<Route path="/audit" element={rp('audit_log.view', <AuditPage/>)} />`.
- [ ] **Step 4: Verify** (`typecheck` + smoke test) + **Commit (orkestrator).**

---

## Task 10: CLI-21 landing routing (Wave 3)

**Files:**
- Modify: `apps/web/src/app/App.tsx` (`/` route → DashboardRouter)

- [ ] **Step 1:** `/` route'ni `<DashboardRouter/>` ga o'zgartir (import `features/dashboard`). Eski `DashboardPage` import GenericDashboard sifatida qoladi (Task 7'da ko'chirilgan bo'lsa).
- [ ] **Step 2: Verify** — `bun --filter @dental/web typecheck && bun --filter @dental/web test` (to'liq). Manual: turli roleKey → mos dashboard.
- [ ] **Step 3: Commit (orkestrator).**

---

## Yakuniy verifikatsiya (R3 yopiladi)
- [ ] `bun --filter @dental/api typecheck && bun --filter @dental/api-client typecheck && bun --filter @dental/web typecheck`
- [ ] `cd apps/api && bun test --env-file=../../.env` (audit integration + mavjudlar) ; `bun --filter @dental/web test`
- [ ] `bun run check:rls`
- [ ] Dev fidelity (inson): rol bo'yicha landing; 6 dashboard; reports ekran + CSV/Excel eksport; audit ekran filtr.
- [ ] Linear CLI-21/66/69/70 → Done; PR `feat/r3-presentation` → main. **R3 (M6) yopiladi.**
